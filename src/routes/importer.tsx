import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FileQuestion,
  Save,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { parseCriFile, type ImportResult } from "@/lib/import/parse";
import { createCri } from "@/lib/cri/repository";
import { getProfile } from "@/lib/profile/repository";
import { detectDocument } from "@/lib/docs/detect";
import { DOC_TYPES, type DetectionResult } from "@/lib/docs/registry";
import { saveOtherDoc } from "@/lib/docs/repository";

export const Route = createFileRoute("/importer")({
  head: () => ({
    meta: [
      { title: "Importer un document (CRI BLO, D15…)" },
      {
        name: "description",
        content:
          "Analysez un document Excel ou PDF : la PWA reconnaît son type et l'ouvre dans le bon module.",
      },
      { property: "og:title", content: "Importer un document" },
      {
        property: "og:description",
        content: "Détection automatique du type de document et reprise des informations reconnues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Importer,
});

function Importer() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [pending, setPending] = useState<{ name: string; kind: "xlsx" | "pdf" } | null>(null);
  const [saved, setSaved] = useState(false);

  async function analyseAsCri(file: File) {
    setResult(await parseCriFile(file));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    fileRef.current = file;
    setBusy(true);
    setError(null);
    setResult(null);
    setDetection(null);
    setSaved(false);
    setPending({ name: file.name, kind: /\.pdf$/i.test(file.name) ? "pdf" : "xlsx" });
    try {
      const det = await detectDocument(file);
      setDetection(det);
      if (det.type === "cri_blo") await analyseAsCri(file);
    } catch (e) {
      setError((e as Error).message || "Impossible d'analyser ce fichier.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function forceCriAnalysis() {
    const file = fileRef.current;
    if (!file) {
      setError("Sélectionnez à nouveau le fichier pour l'analyser comme CRI BLO.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await analyseAsCri(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }


  async function keepInOtherHistory() {
    if (!detection || !pending) return;
    const file = fileRef.current;
    if (!file) {
      setError("Sélectionnez à nouveau le fichier avant de l'enregistrer.");
      return;
    }
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    await saveOtherDoc({
      docType: detection.type,
      fileName: pending.name,
      kind: pending.kind,
      confidence: detection.confidence,
      reasons: detection.reasons,
      textPreview: detection.textPreview,
      blob,
      mimeType: file.type,
      size: file.size,
    });
    setSaved(true);
  }


  async function createFromImport() {
    if (!result) return;
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
  }

  return (
    <AppShell title="Importer un document" subtitle="CRI BLO, D15… détection automatique" showBack>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
        {busy ? "Analyse en cours…" : "Choisir un fichier (.xlsx / .pdf)"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.pdf,application/pdf"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {detection && (
        <div className="mt-3 rounded-xl border border-border bg-card p-2.5">
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

          {detection.type !== "cri_blo" && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                Aucune modification n'a été apportée au module CRI BLO. Que voulez-vous faire ?
              </p>
              <button
                type="button"
                onClick={() => void keepInOtherHistory()}
                disabled={saved}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground transition active:scale-[0.98] disabled:opacity-60"
              >
                <Save className="h-3 w-3" />
                {saved ? "Enregistré dans Autres documents" : "Conserver dans son propre historique"}
              </button>
              {saved && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/documents" })}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground transition active:scale-[0.98]"
                >
                  Ouvrir l'historique « Autres documents »
                </button>
              )}
              <button
                type="button"
                onClick={() => void forceCriAnalysis()}
                disabled={busy}
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-semibold text-muted-foreground transition active:scale-[0.98]"
              >
                Analyser quand même comme CRI BLO
              </button>
            </div>
          )}
        </div>
      )}


      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {result.fileName} · {result.kind.toUpperCase()} · {result.fields.length} information
            {result.fields.length > 1 ? "s" : ""} détectée{result.fields.length > 1 ? "s" : ""}
          </div>

          {result.warning && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              {result.warning}
            </p>
          )}

          {result.fields.length > 0 && (
            <div className="space-y-1">
              {result.fields.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </div>
                  <div className="break-words text-xs font-semibold text-foreground">{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {result.rawPreview && (
            <details className="rounded-lg border border-border bg-card p-2">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                Texte extrait du document
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                {result.rawPreview}
              </pre>
            </details>
          )}

          <button
            type="button"
            onClick={() => void createFromImport()}
            disabled={result.fields.length === 0}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
          >
            <FilePlus2 className="h-3 w-3" />
            Créer un CRI BLO avec ces informations
          </button>
        </div>
      )}
    </AppShell>
  );
}
