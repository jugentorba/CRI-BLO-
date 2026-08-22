import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Download, X, ChevronRight, Camera, FileArchive } from "lucide-react";
import { CRI_SECTIONS, type FieldDef, type SectionDef } from "@/lib/cri/schema";
import { isFieldVisible, isSectionVisible } from "@/lib/cri/visibility";
import { getPhoto } from "@/lib/photos/repository";
import type { GpsCoords } from "@/lib/cri/types";

interface Props {
  values: Record<string, unknown>;
  photos: Record<string, string>;
  gps: GpsCoords | null;
  criId: string;
  onClose: () => void;
  onJump: (field: FieldDef) => void;
  onExport: (kind: "xlsx" | "pdf" | "zip-xlsx" | "zip-pdf") => void;
}

function extraPhotoNumber(slot: string): number | null {
  const match = /^photo_extra_(\d+)$/.exec(slot);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function buildReviewSections(photos: Record<string, string>): SectionDef[] {
  return CRI_SECTIONS.map((section) => {
    if (section.id !== "photosExtras") return section;
    const extraNumbers = Object.keys(photos)
      .map(extraPhotoNumber)
      .filter((n): n is number => !!n)
      .sort((a, b) => a - b);
    const fields: FieldDef[] = extraNumbers.length
      ? extraNumbers.map((n) => ({
          id: `photo_extra_${n}`,
          label: `Photo supplémentaire ${n}`,
          type: "photo" as const,
        }))
      : section.fields;
    return { ...section, fields };
  });
}

function isFilled(f: FieldDef, values: Record<string, unknown>, gps: GpsCoords | null): boolean {
  if (f.type === "gpsCapture") return !!gps;
  const v = values[f.id];
  return v !== undefined && v !== null && v !== "";
}

function formatValue(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (f.type === "yesno" || f.type === "yesnona") {
    if (v === true) return "Oui";
    if (v === false) return "Non";
    if (v === "na") return "N/A";
  }
  if (f.type === "numberNA" && v === "na") return "N/A";
  if (f.type === "datetime" && typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime()))
      return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }
  return String(v);
}

/** Champs clés affichés dans le résumé compact. */
const KEY_FIELDS = [
  "referenceOrange",
  "interventionStart",
  "interventionEnd",
  "commune",
  "codePostal",
  "nomVoie",
  "numeroVoie",
  "defautLocalise",
  "causePrincipale",
  "typeCable",
  "NBSOUD",
  "testAGIR",
];

/** Contrôles légers : n'alerte que sur une incohérence réelle. */
function validate(values: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const start = values.interventionStart as string | undefined;
  const end = values.interventionEnd as string | undefined;
  if (start && end) {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (!isNaN(a) && !isNaN(b) && b < a)
      problems.push("La date de fin d'intervention est antérieure à la date de début.");
  }
  for (const id of ["gpsCoordsA", "gpsCoordsB", "gpsCoordsDefaut"]) {
    const v = (values[id] as string | undefined)?.trim();
    if (v && !/^-?\d+(?:[.,]\d+)?\s*[,;\s]\s*-?\d+(?:[.,]\d+)?$/.test(v))
      problems.push(`Coordonnées GPS invalides (${v}) — format attendu « latitude, longitude ».`);
  }
  const cp = (values.codePostal as string | undefined)?.trim();
  if (cp && !/^\d{5}$/.test(cp)) problems.push("Le code postal doit contenir 5 chiffres.");
  return problems;
}

export function ReviewDialog({ values, photos, gps, criId, onClose, onJump, onExport }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visibleSections = buildReviewSections(photos).filter((s) =>
    isSectionVisible(
      s.fields.map((f) => f.id),
      values,
      photos,
    ),
  );

  const missing: { field: FieldDef; section: SectionDef }[] = [];
  for (const s of visibleSections) {
    for (const f of s.fields) {
      if (!f.required) continue;
      if (!isFieldVisible(f.id, values, photos)) continue;
      if (f.type === "photo") {
        if (!photos[f.id]) missing.push({ field: f, section: s });
        continue;
      }
      if (!isFilled(f, values, gps)) missing.push({ field: f, section: s });
    }
  }
  const problems = validate(values);
  const ready = missing.length === 0;
  const photoCount = Object.keys(photos).length;
  const keyRows = visibleSections
    .flatMap((s) => s.fields)
    .filter((f) => KEY_FIELDS.includes(f.id) && isFieldVisible(f.id, values, photos));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-foreground">Vérification CRI BLO</div>
          <div className="text-xs text-muted-foreground">
            {ready
              ? "Toutes les informations sont complètes"
              : `${missing.length} champ${missing.length > 1 ? "s" : ""} obligatoire${missing.length > 1 ? "s" : ""} manquant${missing.length > 1 ? "s" : ""}`}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 pb-32">
        {ready ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-2.5 text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <div className="text-xs font-bold">CRI BLO prêt pour l'export</div>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <div className="text-xs font-bold">
                {missing.length} champ{missing.length > 1 ? "s" : ""} obligatoire
                {missing.length > 1 ? "s" : ""} manquant{missing.length > 1 ? "s" : ""}
              </div>
            </div>
            <ul className="space-y-1">
              {missing.map(({ field, section }) => (
                <li key={field.id}>
                  <button
                    type="button"
                    onClick={() => onJump(field)}
                    className="flex w-full items-center justify-between rounded-md border border-destructive/40 bg-background px-2 py-1.5 text-left text-xs font-semibold text-destructive transition active:scale-[0.98]"
                  >
                    <span className="flex-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">
                        {section.title}
                      </span>
                      {field.label}
                    </span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {problems.length > 0 && (
          <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-warning">
              <AlertTriangle className="h-3 w-3" />
              <div className="text-xs font-bold">À vérifier</div>
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-[11px] text-warning">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Résumé compact : l'essentiel en un écran */}
        <section className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-primary">Résumé</h3>
            <span className="text-[10px] text-muted-foreground">
              {photoCount} photo{photoCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-1">
            {keyRows.map((f) => (
              <ReviewRow
                key={f.id}
                label={f.label}
                value={formatValue(f, values[f.id])}
                required={f.required}
                missing={!!f.required && !isFilled(f, values, gps)}
                onJump={() => onJump(f)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground"
          >
            {showAll ? "Masquer le détail complet" : "Voir le détail complet"}
          </button>
        </section>

        <div className={showAll ? "space-y-4" : "hidden"}>

          {visibleSections.map((section) => {
            const fields = section.fields.filter((f) => isFieldVisible(f.id, values, photos));
            if (!fields.length) return null;
            return (
              <section key={section.id}>
                <h3 className="mb-2 border-b border-border pb-1 text-xs font-bold uppercase tracking-wide text-primary">
                  {section.title}
                </h3>
                <div className="space-y-1.5">
                  {fields.map((f) => {
                    if (f.type === "photo") {
                      return (
                        <PhotoReviewRow
                          key={f.id}
                          field={f}
                          criId={criId}
                          hasPhoto={!!photos[f.id]}
                          onJump={() => onJump(f)}
                        />
                      );
                    }
                    if (f.type === "gpsCapture") {
                      const ok = !!gps;
                      return (
                        <ReviewRow
                          key={f.id}
                          label={f.label}
                          value={ok ? "✓ position capturée" : "—"}
                          required={f.required}
                          missing={!!f.required && !ok}
                          onJump={() => onJump(f)}
                        />
                      );
                    }
                    const filled = isFilled(f, values, gps);
                    return (
                      <ReviewRow
                        key={f.id}
                        label={f.label}
                        value={formatValue(f, values[f.id])}
                        required={f.required}
                        missing={!!f.required && !filled}
                        onJump={() => onJump(f)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-elevated)]">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!ready}
            onClick={() => onExport("xlsx")}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            Excel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onExport("pdf")}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border-2 border-primary bg-primary/10 px-2 text-xs font-bold text-primary transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            PDF
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onExport("zip-xlsx")}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-primary/40 bg-card px-2 text-xs font-bold text-primary transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileArchive className="h-3 w-3" />
            ZIP avec Excel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onExport("zip-pdf")}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-primary/40 bg-card px-2 text-xs font-bold text-primary transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileArchive className="h-3 w-3" />
            ZIP avec PDF
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Le ZIP contient le document choisi, les photos OI supplémentaires et les fichiers
          supplémentaires (à la racine).
        </p>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  required,
  missing,
  onJump,
}: {
  label: string;
  value: string;
  required?: boolean;
  missing: boolean;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className={
        "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left transition active:scale-[0.99] " +
        (missing
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-card hover:border-primary/30")
      }
    >
      <div className="min-w-0 flex-1">
        <div
          className={
            "text-[11px] font-semibold uppercase tracking-wide " +
            (missing ? "text-destructive" : "text-muted-foreground")
          }
        >
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </div>
        <div
          className={
            "mt-0.5 break-words text-sm " +
            (missing ? "font-bold text-destructive" : "text-foreground")
          }
        >
          {missing ? "À compléter" : value}
        </div>
      </div>
      <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function PhotoReviewRow({
  field,
  criId,
  hasPhoto,
  onJump,
}: {
  field: FieldDef;
  criId: string;
  hasPhoto: boolean;
  onJump: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    if (hasPhoto) {
      void getPhoto(criId, field.id).then((p) => {
        if (!active || !p) return;
        created = URL.createObjectURL(p.blob);
        setUrl(created);
      });
    } else {
      setUrl(null);
    }
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [criId, field.id, hasPhoto]);

  const missing = !!field.required && !hasPhoto;
  return (
    <button
      type="button"
      onClick={onJump}
      className={
        "flex w-full items-center gap-3 rounded-lg border px-2 py-2 text-left transition active:scale-[0.99] " +
        (missing ? "border-destructive/50 bg-destructive/5" : "border-border bg-card")
      }
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {url ? (
          <img src={url} alt={field.label} className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground">{field.label}</div>
        <div
          className={
            "text-[11px] " +
            (hasPhoto
              ? "text-success"
              : missing
                ? "text-destructive font-bold"
                : "text-muted-foreground")
          }
        >
          {hasPhoto ? "✓ Photo enregistrée" : missing ? "Photo manquante" : "Non fournie"}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}
