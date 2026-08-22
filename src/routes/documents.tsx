import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FileQuestion,
  Trash2,
  Files,
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Save,
  ExternalLink,
  FilePenLine,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { UniversalDocumentEditor } from "@/components/UniversalDocumentEditor";
import {
  deleteOtherDoc,
  listOtherDocs,
  openOtherDocFile,
  saveOtherDoc,
  type OtherDocRecord,
} from "@/lib/docs/repository";
import { DOC_TYPES, type DetectionResult } from "@/lib/docs/registry";
import { detectDocument } from "@/lib/docs/detect";
import { parseCriFile } from "@/lib/import/parse";
import { createCri } from "@/lib/cri/repository";
import { getProfile } from "@/lib/profile/repository";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Autres documents — historique séparé" },
      {
        name: "description",
        content:
          "Importez et conservez les documents autres que le CRI BLO (D15, documents non reconnus) dans un historique dédié.",
      },
      { property: "og:title", content: "Autres documents" },
      {
        property: "og:description",
        content: "Historique indépendant des documents non CRI BLO importés dans la PWA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Documents,
});

function Documents() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [docs, setDocs] = useState<OtherDocRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [pending, setPending] = useState<{
    name: string;
    kind: OtherDocRecord["kind"];
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [editingDoc, setEditingDoc] = useState<OtherDocRecord | null>(null);

  async function load() {
    setDocs(await listOtherDocs());
  }
  useEffect(() => {
    void load();
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    fileRef.current = file;
    setBusy(true);
    setError(null);
    setDetection(null);
    setSaved(false);
    setPending({
      name: file.name,
      kind: /\.pdf$/i.test(file.name)
        ? "pdf"
        : /\.(xlsx|xlsm)$/i.test(file.name)
          ? "xlsx"
          : /\.docx$/i.test(file.name)
            ? "docx"
            : "autre",
    });
    try {
      const det = await detectDocument(file);
      setDetection(det);
    } catch (e) {
      // L'analyse ne doit jamais bloquer l'import : on garde le document tel quel.
      setDetection({
        type: "unknown",
        confidence: 0,
        reasons: [
          "Analyse automatique impossible : " +
            ((e as Error).message || "format non lisible dans le navigateur"),
        ],
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /** CRI BLO reconnu : création dans le module CRI BLO (jamais ici). */
  async function sendToCriModule() {
    const file = fileRef.current;
    if (!file) {
      setError("Sélectionnez à nouveau le fichier avant de le traiter comme CRI BLO.");
      return;
    }
    if (!/\.(xlsx|xlsm|pdf|docx)$/i.test(file.name)) {
      setError(
        "Ce format ne peut pas être converti en CRI BLO (Excel .xlsx/.xlsm, PDF ou DOCX).",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await parseCriFile(file);
      if (result.fields.length === 0) {
        setError(
          "Aucune information exploitable n'a été trouvée : ce document ne peut pas être converti en CRI BLO.",
        );
        return;
      }
      const profile = await getProfile();
      const values = { ...result.values } as Record<string, unknown>;
      if (!values.company && profile?.company) values.company = profile.company;
      if (!values.technicianName && profile?.lastName) values.technicianName = profile.lastName;
      const record = await createCri({
        interventionAt: new Date().toISOString(),
        reference: (values.referenceOrange as string) ?? "",
        gps: null,
        address: {
          commune: values.commune as string | undefined,
          postalCode: values.codePostal as string | undefined,
          street: values.nomVoie as string | undefined,
          streetNumber: values.numeroVoie as string | undefined,
        },
        addressStatus: "manual",
        technician: { company: profile?.company, lastName: profile?.lastName },
        status: "draft",
        values,
        photos: {},
      });
      navigate({ to: "/cri/$id", params: { id: record.id } });
    } catch (e) {
      setError((e as Error).message || "Analyse CRI BLO impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function keepHere() {
    if (!detection || !pending) return;
    setBusy(true);
    setError(null);
    try {
      const file = fileRef.current;
      // Le fichier d'origine est conservé pour pouvoir le rouvrir plus tard.
      const blob = file ? new Blob([await file.arrayBuffer()], { type: file.type }) : undefined;
      await saveOtherDoc({
        docType: detection.type,
        fileName: pending.name,
        kind: pending.kind,
        confidence: detection.confidence,
        reasons: detection.reasons,
        textPreview: detection.textPreview,
        blob,
        mimeType: file?.type,
        size: file?.size,
      });
      setSaved(true);
      await load();
    } catch (e) {
      setError((e as Error).message || "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const groups = Array.from(new Set(docs.map((d) => d.docType)));

  return (
    <AppShell title="Autres documents" subtitle="Historiques séparés du CRI BLO">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />}
        {busy ? "Analyse en cours…" : "Importer un document"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {detection && (
        <div className="mt-2 rounded-xl border border-border bg-card p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            {detection.type === "cri_blo" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <FileQuestion className="h-3.5 w-3.5 text-warning" />
            )}
            Type détecté : {DOC_TYPES[detection.type].label}
            <span className="ml-auto text-[10px] font-semibold text-muted-foreground">
              {Math.round(detection.confidence * 100)} %
            </span>
          </div>
          <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            {detection.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>

          <div className="mt-2 space-y-1.5">
            {detection.type === "cri_blo" ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Ce document est un CRI BLO : il doit rejoindre le module et l'historique CRI BLO.
                </p>
                <button
                  type="button"
                  onClick={() => void sendToCriModule()}
                  disabled={busy}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-60"
                >
                  Ouvrir dans le module CRI BLO
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Aucune modification n'a été apportée au module CRI BLO. Que voulez-vous faire ?
                </p>
                <button
                  type="button"
                  onClick={() => void keepHere()}
                  disabled={saved}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground active:scale-[0.98] disabled:opacity-60"
                >
                  <Save className="h-3 w-3" />
                  {saved ? "Enregistré dans Autres documents" : "Conserver dans Autres documents"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendToCriModule()}
                  disabled={busy}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-semibold text-muted-foreground active:scale-[0.98]"
                >
                  Traiter quand même comme CRI BLO
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Aucun autre document enregistré. Les documents importés qui ne sont pas des CRI BLO
          apparaîtront ici, sans jamais toucher à l'historique CRI BLO.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g} className="mt-3">
            <h2 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Files className="h-3 w-3" />
              {DOC_TYPES[g]?.label ?? g}
            </h2>
            <div className="space-y-1">
              {docs
                .filter((d) => d.docType === g)
                .map((d) => (
                  <div
                    key={d.id}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2"
                  >
                    <FileQuestion className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-foreground">{d.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {d.kind.toUpperCase()} ·{" "}
                        {new Date(d.createdAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {d.reasons[0] ? ` · ${d.reasons[0]}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Modifier"
                      disabled={!d.blob}
                      onClick={() => setEditingDoc(d)}
                      className="rounded-lg p-1 text-primary hover:bg-primary/10 disabled:opacity-30"
                    >
                      <FilePenLine className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Ouvrir"
                      disabled={!d.blob}
                      onClick={() => {
                        if (!openOtherDocFile(d)) {
                          setError("Fichier d'origine indisponible pour ce document.");
                        }
                      }}
                      className="rounded-lg p-1 text-primary hover:bg-primary/10 disabled:opacity-30"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer"
                      onClick={async () => {
                        await deleteOtherDoc(d.id);
                        void load();
                      }}
                      className="rounded-lg p-1 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ))
      )}
      {editingDoc?.blob && (
        <UniversalDocumentEditor
          document={{ name: editingDoc.fileName, mimeType: editingDoc.mimeType, blob: editingDoc.blob }}
          onClose={() => setEditingDoc(null)}
          onSaved={() => setError(null)}
        />
      )}
    </AppShell>
  );
}
