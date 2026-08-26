import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Loader2,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Cloud,
  CloudOff,
  ChevronRight,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CRI_SECTIONS, type FieldDef } from "@/lib/cri/schema";
import { isFieldVisible, isSectionVisible } from "@/lib/cri/visibility";
import { getCri, updateCri } from "@/lib/cri/repository";
import { getProfile } from "@/lib/profile/repository";
import { getSettings, type AppSettings } from "@/lib/settings/repository";
import { getCurrentPosition, type GpsError } from "@/lib/geo/gps";
import { reverseGeocode } from "@/lib/geo/geocode.functions";
import { cacheAddress, getNearestCachedAddress } from "@/lib/geo/geocache";
import { resolvePendingAddresses } from "@/lib/geo/queue";
import { useOnline } from "@/hooks/use-online";
import type { Address, CriRecord, GpsCoords, TechnicianProfile } from "@/lib/cri/types";
import { YesNoButtons } from "@/components/cri/YesNoButtons";
import { SearchableSelect } from "@/components/cri/SearchableSelect";
import { DictationTextarea } from "@/components/cri/DictationTextarea";
import { PhotoSlot } from "@/components/cri/PhotoSlot";
import { ExtraPhotosBatchAdd } from "@/components/cri/ExtraPhotosBatchAdd";
import { buildXlsxExport } from "@/lib/export/xlsx";
import { buildPdfExport } from "@/lib/export/pdf";
import { buildZipExport } from "@/lib/export/zip";
import { exportFileName, zipFileName } from "@/lib/export/naming";
import { downloadBlob, isFolderPickerSupported, pickExportFolder, writeFileToExportFolder } from "@/lib/export/folder";
import { cn } from "@/lib/utils";
import { ReviewDialog } from "@/components/cri/ReviewDialog";
import { AttachmentsSection } from "@/components/cri/AttachmentsSection";
import { DateTimePicker } from "@/components/cri/DateTimePicker";
import { ExtraPhotosSection } from "@/components/cri/ExtraPhotosSection";
import type { CommentContext } from "@/lib/ai/glossary";

/** Champs « Coordonnées GPS » fusionnés dans le bloc GPS compact. */
const GPS_COORD_FIELDS: Record<string, "A" | "B" | "defaut"> = {
  gpsCoordsA: "A",
  gpsCoordsB: "B",
  gpsCoordsDefaut: "defaut",
};

function coordsFieldFor(scope: "A" | "B" | "defaut"): string {
  return scope === "A" ? "gpsCoordsA" : scope === "B" ? "gpsCoordsB" : "gpsCoordsDefaut";
}

export const Route = createFileRoute("/cri/$id")({
  head: () => ({
    meta: [
      { title: "Éditer CRI BLO" },
      { name: "description", content: "Édition d'un compte-rendu d'intervention SAV BLO." },
    ],
  }),
  component: CriEditor,
});

function extraPhotoNumber(slot: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(slot);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}


function CriEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const [cri, setCri] = useState<CriRecord | null>(null);
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [address, setAddress] = useState<Address>({});
  const [addressStatus, setAddressStatus] = useState<CriRecord["addressStatus"]>("failed");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [missing, setMissing] = useState<FieldDef[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [exportToast, setExportToast] = useState<{
    fileName: string;
    blob: Blob;
    folderName?: string;
  } | null>(null);

  // Load
  useEffect(() => {
    void (async () => {
      const [c, p, s] = await Promise.all([getCri(id), getProfile(), getSettings()]);
      if (!c) {
        navigate({ to: "/" });
        return;
      }
      setCri(c);
      setProfile(p);
      setSettings(s);
      setValues(c.values ?? {});
      setPhotos(c.photos ?? {});
      setGps(c.gps);
      setAddress(c.address);
      setAddressStatus(c.addressStatus);

      // Pré-remplissage automatique (entreprise, nom, date début) si vide
      const autoPatch: Record<string, unknown> = {};
      if (!c.values?.company && p?.company) autoPatch.company = p.company;
      if (!c.values?.technicianName && p?.lastName) autoPatch.technicianName = p.lastName;
      if (!c.values?.interventionStart) autoPatch.interventionStart = c.interventionAt;
      // Rétro-compat : si on a déjà une adresse géocodée, alimente les champs officiels.
      if (!c.values?.commune && c.address?.commune) autoPatch.commune = c.address.commune;
      if (!c.values?.codePostal && c.address?.postalCode) autoPatch.codePostal = c.address.postalCode;
      if (!c.values?.nomVoie && c.address?.street) autoPatch.nomVoie = c.address.street;
      if (!c.values?.numeroVoie && c.address?.streetNumber) autoPatch.numeroVoie = c.address.streetNumber;
      if (Object.keys(autoPatch).length) {
        setValues((v) => ({ ...v, ...autoPatch }));
        setDirty(true);
      }
    })();
  }, [id, navigate]);

  // Auto GPS au premier chargement si absent
  const triedGps = useRef(false);
  useEffect(() => {
    if (!cri || triedGps.current) return;
    if (!gps && !gpsLoading) {
      triedGps.current = true;
      void captureGps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cri]);

  // Auto-save debounced
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!cri || !dirty) return;
    if (!settings?.autoSave) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void persist();
    }, 700);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, photos, gps, address, addressStatus, dirty, settings?.autoSave]);

  const persist = useCallback(async () => {
    if (!cri) return;
    const reference = (values.referenceOrange as string | undefined)?.trim() ?? cri.reference ?? "";
    const updated = await updateCri(cri.id, {
      values,
      photos,
      gps,
      address,
      addressStatus,
      reference,
      technician: {
        ...cri.technician,
        company: profile?.company,
        lastName: profile?.lastName,
      },
      status: cri.status === "exported" ? "exported" : "draft",
    });
    setCri(updated);
    setSavedAt(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    setDirty(false);
  }, [cri, values, photos, gps, address, addressStatus, profile]);

  function applyAddressToValues(addr: Address) {
    setValues((prev) => ({
      ...prev,
      commune: addr.commune ?? prev.commune ?? "",
      codePostal: addr.postalCode ?? prev.codePostal ?? "",
      nomVoie: addr.street ?? prev.nomVoie ?? "",
      numeroVoie: addr.streetNumber ?? prev.numeroVoie ?? "",
    }));
  }

  function countFields(a: Address): number {
    let n = 0;
    if (a.streetNumber) n++;
    if (a.street && a.street.trim().toLowerCase() !== "route sans nom") n++;
    if (a.postalCode) n++;
    if (a.commune) n++;
    return n;
  }

  function cleanGeoAddress(text: string) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => {
        const normalized = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return !/villefr.nche[\s-]*(de[\s-]*)?rouergue/.test(normalized);
      })
      .join(", ");
  }

  // GPS
  async function captureGps(scope?: "A" | "B" | "defaut") {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const coords = await getCurrentPosition();
      const coordsStr = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      // GPS principal pour le filigrane photo : premier capturé fait foi
      setGps((prev) => prev ?? coords);
      setDirty(true);

      // Écrit les coordonnées dans le champ texte de la sous-section
      if (scope) {
        const coordsField = scope === "A" ? "gpsCoordsA" : scope === "B" ? "gpsCoordsB" : "gpsCoordsDefaut";
        setValues((prev) => ({ ...prev, [coordsField]: coordsStr }));
      }

      // 1) Cache local d'abord : garantit une adresse même hors-ligne / si
      //    l'API renvoie un résultat incomplet plus tard.
      const cached = await getNearestCachedAddress(coords.latitude, coords.longitude);
      if (cached) {
        await applyReverseGeocode(cached.address, scope);
      }

      // 2) Rafraîchit depuis le réseau : met à jour le cache si plus complet.
      if (navigator.onLine) {
        try {
          const addr = await reverseGeocode({
            data: { latitude: coords.latitude, longitude: coords.longitude },
          });
          await cacheAddress(coords.latitude, coords.longitude, addr);
          // Si le réseau apporte une adresse plus complète que le cache initial,
          // on l'applique par-dessus (sinon on garde ce qui est déjà affiché).
          const better =
            !cached ||
            countFields(addr) >= countFields(cached.address);
          if (better) await applyReverseGeocode(addr, scope);
        } catch {
          if (!cached && (!scope || scope === "defaut")) setAddressStatus("failed");
        }
      } else if (!cached && (!scope || scope === "defaut")) {
        setAddressStatus("pending");
      }
    } catch (err) {
      const e = err as GpsError;
      const messages: Record<GpsError["code"], string> = {
        denied: "Accès à la position refusé.",
        unavailable: "Position indisponible. Activez le GPS.",
        timeout: "Le GPS met trop de temps.",
        unsupported: "Géolocalisation non supportée.",
      };
      setGpsError(messages[e.code] ?? e.message);
    } finally {
      setGpsLoading(false);
    }
  }

  // Adresse courte "numéro + voie" (sans commune ni CP) pour Adresse A/B/Défaut
  // Adresse complète pour Adresse A/B/Défaut : "numéro voie CP commune"
  // (sans duplication de la commune que Nominatim ajoute parfois dans display_name).
  function fullStreetAddress(a: Address): string {
    const line1 = [a.streetNumber, a.street].filter(Boolean).join(" ").trim();
    const line2 = [a.postalCode, a.commune].filter(Boolean).join(" ").trim();
    const country = (a.country ?? "").trim();
    return [line1, line2, country].filter(Boolean).join(", ");
  }

  async function applyReverseGeocode(addr: Address, scope?: "A" | "B" | "defaut") {
    const full = fullStreetAddress(addr);
    setAddress(addr);
    setAddressStatus("resolved");
    applyAddressToValues(addr);
    setValues((prev) => {
      const next = { ...prev };
      if (scope === "A") next.adresseA = full;
      else if (scope === "B") next.adresseB = full;
      // Défaut : pas de champ Adresse, on ne remplit que Commune / CP / Voie / Numéro.
      return next;
    });
    setDirty(true);
  }

  // Reverse geocode manuel : parse "lat, lon" depuis le champ Coordonnées GPS
  async function manualGeocode(scope: "A" | "B" | "defaut") {
    setGpsError(null);
    const coordsField = scope === "A" ? "gpsCoordsA" : scope === "B" ? "gpsCoordsB" : "gpsCoordsDefaut";
    const raw = (values[coordsField] as string | undefined)?.trim();
    if (!raw) {
      setGpsError("Saisissez d'abord les coordonnées (latitude, longitude).");
      return;
    }
    const m = raw.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
    if (!m) {
      setGpsError("Format attendu : « latitude, longitude » (ex. 44.5555, 2.2555).");
      return;
    }
    const lat = parseFloat(m[1].replace(",", "."));
    const lon = parseFloat(m[2].replace(",", "."));
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setGpsError("Coordonnées invalides.");
      return;
    }
    setGpsLoading(true);
    try {
      // Cache d'abord (utile en zone à connexion faible).
      const cached = await getNearestCachedAddress(lat, lon);
      if (cached) await applyReverseGeocode(cached.address, scope);
      if (!navigator.onLine) {
        if (!cached) setGpsError("Connexion requise pour rechercher l'adresse.");
        return;
      }
      const addr = await reverseGeocode({ data: { latitude: lat, longitude: lon } });
      await cacheAddress(lat, lon, addr);
      if (!cached || countFields(addr) >= countFields(cached.address)) {
        await applyReverseGeocode(addr, scope);
      }
    } catch {
      setGpsError("Impossible de récupérer l'adresse pour ces coordonnées.");
    } finally {
      setGpsLoading(false);
    }
  }



  // Online → tente résolution adresse en attente
  useEffect(() => {
    if (online && addressStatus === "pending" && gps) {
      void (async () => {
        try {
          const addr = await reverseGeocode({
            data: { latitude: gps.latitude, longitude: gps.longitude },
          });
          setAddress(addr);
          setAddressStatus("resolved");
          applyAddressToValues(addr);
          setDirty(true);
        } catch {
          /* silencieux */
        }
      })();
      void resolvePendingAddresses();
    }
  }, [online, addressStatus, gps]);

  function setValue(fieldId: string, v: unknown) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
    // Synchronise vers l'objet `address` pour le filigrane photo et l'export.
    const addrKey: Record<string, keyof Address> = {
      commune: "commune",
      codePostal: "postalCode",
      nomVoie: "street",
      numeroVoie: "streetNumber",
    };
    const k = addrKey[fieldId];
    if (k) {
      setAddress((prev) => ({ ...prev, [k]: typeof v === "string" ? v : prev[k] }));
      setAddressStatus("manual");
    }
    setDirty(true);
  }

  function setPhoto(slot: string, has: boolean) {
    setPhotos((prev) => {
      const next = { ...prev };
      if (has) next[slot] = slot;
      else delete next[slot];
      return next;
    });
    setDirty(true);
  }

  async function handleSaveDraft() {
    await persist();
  }

  async function handleExport(kind: "xlsx" | "pdf" | "zip-xlsx" | "zip-pdf") {
    // Sauvegarde d'abord
    await persist();
    if (!cri) return;
    // Validation des champs obligatoires
    const missingFields = CRI_SECTIONS.flatMap((s) => s.fields).filter((f) => {
      if (!f.required) return false;
      if (!isFieldVisible(f.id, values, photos)) return false;
      if (f.type === "gpsCapture") return !gps;
      if (f.type === "photo") return !photos[f.id];
      const v = values[f.id];
      return v === undefined || v === null || v === "";
    });
    if (missingFields.length) {
      setMissing(missingFields);
      return;
    }
    const payload: CriRecord = {
      ...cri,
      values,
      photos,
      gps,
      address,
      addressStatus,
    };
    const reference = (values.referenceOrange as string) ?? cri.reference;
    const communeVal = (values.commune as string) ?? address.commune ?? "";
    let blob: Blob;
    let fileName: string;
    if (kind === "xlsx") {
      blob = await buildXlsxExport(payload);
      fileName = exportFileName(reference, communeVal, "xlsx");
    } else if (kind === "pdf") {
      blob = await buildPdfExport(payload);
      fileName = exportFileName(reference, communeVal, "pdf");
    } else {
      blob = await buildZipExport(payload, kind === "zip-pdf" ? "pdf" : "xlsx");
      fileName = zipFileName(reference, communeVal);
    }

    // Choix de dossier si pas encore défini et supporté
    let folderName: string | undefined;
    if (isFolderPickerSupported() && !settings?.exportFolderName) {
      try {
        const handle = await pickExportFolder();
        if (handle) {
          folderName = handle.name;
          const next = await getSettings();
          setSettings(next);
        }
      } catch {
        /* annulé */
      }
    }

    const res = await writeFileToExportFolder(fileName, blob);
    if (!res.wrote) {
      downloadBlob(fileName, blob);
    } else {
      folderName = res.folderName;
    }
    await updateCri(cri.id, { status: "exported", exportedAt: new Date().toISOString(), exported: true });
    // Queue an OneDrive upload (local-first: local save already happened above).
    if (settings?.cloudSyncEnabled) {
      try {
        const { enqueueUpload, drainQueue } = await import("@/lib/onedrive/queue");
        await enqueueUpload(kind.startsWith("zip") ? "zip" : "excel", fileName, blob);
        void drainQueue();
      } catch {
        /* sync failure never blocks local export */
      }
    }
    setExportToast({ fileName, blob, folderName });
    // Retour automatique à l'accueil après export (laisse le temps de lire le toast).
    setTimeout(() => {
      setExportToast(null);
      void navigate({ to: "/" });
    }, 2500);
  }

  if (!cri || !settings) {
    return (
      <AppShell title="Chargement…" showBack>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </AppShell>
    );
  }

  const subtitle =
    cri.status === "exported"
      ? "Exporté"
      : dirty
        ? "Modifié"
        : savedAt
          ? `Sauvegardé ${savedAt}`
          : "Brouillon";

  // Contexte transmis à l'assistant de rédaction (aucune donnée inventée).
  const assistContext: CommentContext = {
    reference: (values.referenceOrange as string) || undefined,
    commune: (values.commune as string) || address.commune || undefined,
    interventionStart: (values.interventionStart as string) || undefined,
    typeCable: (values.typeCable as string) || undefined,
    referenceContenant: (values.referenceContenant as string) || undefined,
    causePrincipale: (values.causePrincipale as string) || undefined,
  };


  return (
    <AppShell title="CRI BLO" subtitle={subtitle} showBack>
      {/* Status pill (non-sticky, minimal) */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {online ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3 text-warning" />}
        <span>{settings.autoSave ? "Sauvegarde auto" : "Sauvegarde manuelle"}</span>
        {savedAt && !dirty && <span className="ml-auto text-success">✓ {savedAt}</span>}
        {dirty && <span className="ml-auto text-warning">Modifié…</span>}
      </div>

      {!online && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <WifiOff className="h-3.5 w-3.5 text-warning" />
          <span>Mode hors-ligne — GPS, photos et brouillons fonctionnent.</span>
        </div>
      )}

      {/* Sections — une seule page scrollable, dense */}
      <div className="space-y-6 pb-24">
        {CRI_SECTIONS.map((section) => {
          const isSupplementaryPhotos = section.id === "photosExtras";
          const sectionFields = section.fields;
          if (
            !isSupplementaryPhotos &&
            !isSectionVisible(sectionFields.map((f) => f.id), values, photos)
          )
            return null;
          const visibleFields = sectionFields.filter(
            (f) => isFieldVisible(f.id, values, photos) && !(f.id in GPS_COORD_FIELDS),
          );
          return (
            <section key={section.id} id={`s-${section.id}`}>
              <h2 className="mb-2 border-b border-primary/30 pb-1 text-sm font-bold uppercase tracking-wide text-primary">
                {section.title}
              </h2>
              {isSupplementaryPhotos ? (
                <ExtraPhotosSection
                  criId={cri.id}
                  address={address}
                  watermarkEnabled={settings.watermark}
                  saveToGallery={settings.saveToGallery}
                  photos={photos}
                  onPhotosChange={(next) => {
                    setPhotos(next);
                    setDirty(true);
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {visibleFields.map((f) => (
                    <FieldRow
                      key={f.id}
                      field={f}
                      value={values[f.id]}
                      onChange={(v) => setValue(f.id, v)}
                      gps={gps}
                      address={address}
                      addressStatus={addressStatus}
                      gpsLoading={gpsLoading}
                      gpsError={gpsError}
                      online={online}
                      coordsValue={
                        f.type === "gpsCapture"
                          ? ((values[coordsFieldFor(f.scope ?? "defaut")] as string) ?? "")
                          : ""
                      }
                      onCoordsChange={(v) =>
                        setValue(coordsFieldFor(f.scope ?? "defaut"), v)
                      }
                      assistContext={assistContext}
                      onGpsCapture={(scope) => captureGps(scope)}
                      onManualGeocode={(scope) => manualGeocode(scope)}
                      onAddressChange={(a) => {
                        setAddress(a);
                        setAddressStatus("manual");
                        setDirty(true);
                      }}
                      criId={cri.id}
                      hasPhoto={!!photos[f.id]}
                      onPhotoChange={(has) => setPhoto(f.id, has)}
                      saveToGallery={settings.saveToGallery}
                      watermark={settings.watermark}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <AttachmentsSection criId={cri.id} />
      </div>

      {/* FAB : Enregistrer → ouvre l'écran de finalisation / export */}
      <button
        type="button"
        onClick={async () => {
          await handleSaveDraft();
          setReviewing(true);
        }}
        aria-label="Enregistrer et finaliser"
        title="Enregistrer et finaliser"
        className="fixed bottom-20 right-3 z-30 inline-flex h-10 items-center gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground shadow-[var(--shadow-elevated)] transition active:scale-95"
      >
        <Save className="h-3 w-3" />
        Enregistrer
        {dirty && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warning ring-2 ring-primary" />
        )}
      </button>

      {/* Review screen */}
      {reviewing && (
        <ReviewDialog
          values={values}
          photos={photos}
          gps={gps}
          criId={cri.id}
          onClose={() => setReviewing(false)}
          onJump={(f) => {
            setReviewing(false);
            setTimeout(() => {
              const el = document.getElementById(`f-${f.id}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              setTimeout(() => {
                const input = el?.querySelector("input,textarea,button") as HTMLElement | null;
                input?.focus();
              }, 350);
            }, 50);
          }}
          onExport={(kind) => {
            setReviewing(false);
            void handleExport(kind);
          }}
        />
      )}

      {/* Modal champs manquants (fallback) */}
      {missing && (
        <MissingDialog
          fields={missing}
          onClose={() => setMissing(null)}
          onJump={(f) => {
            setMissing(null);
            const el = document.getElementById(`f-${f.id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => {
              const input = el?.querySelector("input,textarea,button") as HTMLElement | null;
              input?.focus();
            }, 400);
          }}
        />
      )}

      {/* Toast export */}
      {exportToast && (
        <ExportSuccessToast
          fileName={exportToast.fileName}
          folderName={exportToast.folderName}
          blob={exportToast.blob}
          onClose={() => setExportToast(null)}
        />
      )}
    </AppShell>
  );
}

/* ---------- Field renderer ---------- */

function NAQuickButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Insérer N/A sans ouvrir le clavier"
      aria-label="Insérer N/A"
      className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-background px-1.5 text-[10px] font-black text-muted-foreground hover:border-primary/50 hover:text-primary active:scale-95"
    >
      N/A
    </button>
  );
}

function FieldRow(props: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  gps: GpsCoords | null;
  address: Address;
  addressStatus: CriRecord["addressStatus"];
  gpsLoading: boolean;
  gpsError: string | null;
  online: boolean;
  coordsValue: string;
  onCoordsChange: (v: string) => void;
  assistContext: CommentContext;
  onGpsCapture: (scope?: "A" | "B" | "defaut") => void;
  onManualGeocode: (scope: "A" | "B" | "defaut") => void;
  onAddressChange: (a: Address) => void;
  criId: string;
  hasPhoto: boolean;
  onPhotoChange: (h: boolean) => void;
  saveToGallery: boolean;
  watermark: boolean;
}) {
  const { field: f } = props;

  if (f.type === "photo") {
    return (
      <div id={`f-${f.id}`}>
        <PhotoSlot
          criId={props.criId}
          slot={f.id}
          label={f.label}
          hint={f.hint}
          address={props.address}
          watermarkEnabled={props.watermark}
          saveToGallery={props.saveToGallery}
          hasPhoto={props.hasPhoto}
          onChange={props.onPhotoChange}
        />
      </div>
    );
  }

  if (f.type === "gpsCapture") {
    const scope = f.scope ?? "defaut";
    return (
      <div id={`f-${f.id}`} className="rounded-lg border border-border bg-card p-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => props.onGpsCapture(f.scope)}
            disabled={props.gpsLoading}
            aria-label="Utiliser la position GPS actuelle"
            title="Utiliser la position GPS actuelle"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-70"
          >
            {props.gpsLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : props.gps ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={props.coordsValue}
            onChange={(e) => props.onCoordsChange(e.target.value)}
            placeholder="latitude, longitude"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => props.onManualGeocode(scope)}
            disabled={props.gpsLoading || !props.online}
            aria-label="Rechercher l'adresse depuis ces coordonnées"
            title={
              props.online
                ? "Rechercher l'adresse depuis ces coordonnées"
                : "Connexion requise"
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition active:scale-95 disabled:opacity-50"
          >
            <Search className="h-3 w-3" />
          </button>
        </div>

        {props.gpsError && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-1.5 text-[11px] text-destructive">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {props.gpsError}
          </div>
        )}

        {(scope === "defaut" || props.gps) && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            {props.gps?.accuracy && <span>±{Math.round(props.gps.accuracy)} m</span>}
            {scope === "defaut" && <AddressStatusBadge status={props.addressStatus} />}
          </div>
        )}
      </div>
    );
  }

  const label = (
    <div className="mb-1 flex items-center gap-1">
      <label htmlFor={`f-${f.id}`} className="block text-xs font-semibold text-foreground">
        {f.label}
        {f.required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {(f.type === "text" || f.type === "textLong") &&
        !["adresseA", "adresseB", "gpsCoordsA", "gpsCoordsB", "gpsCoordsDefaut", "commune", "codePostal", "nomVoie", "numeroVoie"].includes(f.id) && (
          <NAQuickButton onClick={() => props.onChange("N/A")} />
        )}
    </div>
  );

  if (f.type === "yesno" || f.type === "yesnona") {
    return (
      <div id={`f-${f.id}`}>
        {label}
        <YesNoButtons
          value={props.value as true | false | "na" | undefined}
          onChange={props.onChange}
          allowNA={f.type === "yesnona"}
        />
      </div>
    );
  }

  if (f.type === "choice") {
    const current = typeof props.value === "string" ? props.value : "";
    const options = f.options ?? [];
    const selected = options.find((o) => current === o || current.startsWith(`${o} `)) ?? "";
    const extra = selected && current.length > selected.length ? current.slice(selected.length + 1) : "";
    const compose = (opt: string, text: string) => (text.trim() ? `${opt} ${text.trim()}` : opt);
    return (
      <div id={`f-${f.id}`}>
        {label}
        <div className="flex gap-1.5">
          {options.map((o) => {
            const active = o === selected;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={active}
                onClick={() => props.onChange(active ? undefined : compose(o, extra))}
                className={
                  "h-10 flex-1 rounded-lg border text-sm font-bold transition active:scale-95 " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40")
                }
              >
                {o}
              </button>
            );
          })}
        </div>
        {f.freeTextLabel && selected === "RIP" && (
          <input
            id={`f-${f.id}-input`}
            type="text"
            value={extra}
            placeholder={f.freeTextLabel}
            onChange={(e) => props.onChange(compose(selected, e.target.value))}
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        )}
      </div>
    );
  }

  if (f.type === "select") {
    return (
      <div id={`f-${f.id}`}>
        {label}
        <SearchableSelect
          value={(props.value as string) ?? undefined}
          onChange={(v) => props.onChange(v)}
          options={f.options ?? []}
        />
      </div>
    );
  }

  if (f.type === "textLong") {
    return (
      <div id={`f-${f.id}`}>
        {label}
        <DictationTextarea
          value={(props.value as string) ?? ""}
          onChange={(v) => props.onChange(v)}
          example={f.example}
          placeholder="Saisir, dicter ou reformuler avec l'IA…"
          assist
          assistContext={props.assistContext}
        />
      </div>
    );
  }

  if (f.type === "number") {
    return (
      <div id={`f-${f.id}`}>
        {label}
        <input
          id={`f-${f.id}-input`}
          type="number"
          inputMode="decimal"
          value={(props.value as string | number | undefined) ?? ""}
          onChange={(e) =>
            props.onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>
    );
  }

  if (f.type === "numberNA") {
    const isNA = props.value === "na";
    const numVal = typeof props.value === "number" ? props.value : "";
    return (
      <div id={`f-${f.id}`}>
        {label}
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-pressed={isNA}
            onClick={() => props.onChange(isNA ? undefined : "na")}
            className={
              "h-10 shrink-0 rounded-lg border px-3 text-xs font-bold transition active:scale-95 " +
              (isNA
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary/40")
            }
          >
            N/A
          </button>
          <input
            id={`f-${f.id}-input`}
            type="number"
            inputMode="decimal"
            placeholder={isNA ? "Non applicable" : "Saisir une valeur (1, 2, 12, 24, 48, 96, 144, …)"}
            value={isNA ? "" : numVal}
            disabled={isNA}
            onChange={(e) =>
              props.onChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
            onFocus={() => {
              if (isNA) props.onChange(undefined);
            }}
            className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
      </div>
    );
  }

  if (f.type === "datetime") {
    return (
      <div id={`f-${f.id}`}>
        {label}
        <DateTimePicker
          value={(props.value as string | undefined) ?? undefined}
          onChange={props.onChange}
        />
      </div>
    );
  }

  return (
    <div id={`f-${f.id}`}>
      {label}
      <input
        type="text"
        value={(props.value as string) ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function AddrInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  inputMode?: "text" | "numeric";
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function AddressStatusBadge({ status }: { status: CriRecord["addressStatus"] }) {
  const conf = {
    resolved: { label: "Adresse trouvée", cls: "bg-success/10 text-success" },
    pending: { label: "Adresse en attente (hors-ligne)", cls: "bg-warning/15 text-warning" },
    manual: { label: "Adresse modifiée manuellement", cls: "bg-primary/10 text-primary" },
    failed: { label: "Adresse à compléter", cls: "bg-destructive/10 text-destructive" },
  }[status];
  return (
    <div className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold", conf.cls)}>
      {conf.label}
    </div>
  );
}

function MissingDialog({
  fields,
  onClose,
  onJump,
}: {
  fields: FieldDef[];
  onClose: () => void;
  onJump: (f: FieldDef) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-[var(--shadow-elevated)]">
        <div className="mb-3 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <h3 className="text-lg font-bold">Champs obligatoires manquants</h3>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Complétez ces champs avant d'exporter. Les données saisies sont conservées.
        </p>
        <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto">
          {fields.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onJump(f)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-left text-sm font-semibold text-foreground transition active:scale-[0.98] hover:border-primary/40"
              >
                <span>{f.label}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="h-9 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-[0.98]"
        >
          Continuer la saisie
        </button>
      </div>
    </div>
  );
}

function ExportSuccessToast({
  fileName,
  folderName,
  blob,
  onClose,
}: {
  fileName: string;
  folderName?: string;
  blob: Blob;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-[var(--shadow-elevated)]">
        <div className="mb-3 flex items-center gap-2 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <h3 className="text-lg font-bold text-foreground">Export réussi</h3>
        </div>
        <div className="mb-1 text-sm font-semibold text-foreground">{fileName}</div>
        {folderName && (
          <div className="mb-4 text-xs text-muted-foreground">Dossier : {folderName}</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
            className="h-9 rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition active:scale-95"
          >
            Ouvrir
          </button>
          <button
            type="button"
            onClick={async () => {
              const file = new File([blob], fileName, { type: blob.type });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: fileName });
              } else {
                downloadBlob(fileName, blob);
              }
            }}
            className="h-9 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-95"
          >
            Partager
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-10 w-full text-sm font-semibold text-muted-foreground"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

