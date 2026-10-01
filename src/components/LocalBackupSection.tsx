import { useRef, useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { exportSyncSnapshot, importSyncSnapshot } from "@/lib/db";

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function LocalBackupSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function exportBackup() {
    setBusy("export");
    setMessage(null);
    try {
      const blob = await exportSyncSnapshot();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadBlob(`CRI-BLO-Backup-${stamp}.json`, blob);
      setMessage(`Sauvegarde créée (${Math.max(1, Math.round(blob.size / 1024))} Ko).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    if (!confirm("Restaurer cette sauvegarde CRI BLO ? Les éléments portant les mêmes identifiants seront remplacés.")) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy("import");
    setMessage(null);
    try {
      await importSyncSnapshot(file);
      setMessage("Restauration terminée. L’application va se recharger.");
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Restauration impossible.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Sauvegarde locale
      </h2>
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Historique, photos et pièces jointes
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Créez un fichier de sauvegarde avant chaque mise à jour. Il contient les données CRI BLO locales,
          les photos et les pièces jointes, mais jamais les clés API.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void exportBackup()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {busy === "export" ? "Création…" : "Exporter"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background text-xs font-bold text-foreground disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {busy === "import" ? "Restauration…" : "Restaurer"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void importBackup(e.target.files?.[0])}
        />
        {message && <div className="mt-3 rounded-lg bg-primary/5 p-2 text-[11px] text-muted-foreground">{message}</div>}
      </div>
    </section>
  );
}
