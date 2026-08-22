import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus, Trash2, FileText, ExternalLink } from "lucide-react";
import {
  addAttachment,
  deleteAttachment,
  humanSize,
  listAttachments,
  type AttachmentRecord,
} from "@/lib/attachments/repository";
import { downloadBlob } from "@/lib/export/folder";

export function AttachmentsSection({ criId }: { criId: string }) {
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listAttachments(criId).then(setItems);
  }, [criId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await addAttachment(criId, file);
      }
      setItems(await listAttachments(criId));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleOpen(a: AttachmentRecord) {
    const url = URL.createObjectURL(a.blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // Certaines WebView bloquent l'ouverture : on retombe sur le téléchargement.
      downloadBlob(a.name, a.blob);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce fichier ?")) return;
    await deleteAttachment(id);
    setItems(await listAttachments(criId));
  }

  return (
    <section id="s-attachments">
      <h2 className="mb-4 border-b-2 border-primary/30 pb-1 text-base font-bold uppercase tracking-wide text-primary">
        Fichiers supplémentaires
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Fichiers externes joints à l'intervention (PDF, Word, Excel, images, …).
        Ils ne sont PAS ajoutés dans le CRI Excel — ils sont inclus dans l'export ZIP.
      </p>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
            Aucun fichier joint.
          </div>
        )}
        {items.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-[var(--shadow-card)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-3 w-3" />
            </div>
            <button
              type="button"
              onClick={() => handleOpen(a)}
              className="min-w-0 flex-1 text-left"
              aria-label={`Ouvrir ${a.name}`}
            >
              <div className="truncate text-sm font-semibold text-foreground underline decoration-primary/40">
                {a.name}
              </div>
              <div className="text-xs text-muted-foreground">{humanSize(a.size)}</div>
            </button>
            <button
              type="button"
              onClick={() => handleOpen(a)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-primary transition active:scale-95"
              aria-label="Ouvrir le fichier"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(a.id)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive transition active:scale-95"
              aria-label="Supprimer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-2 text-xs font-bold text-primary transition active:scale-95 disabled:opacity-50"
      >
        {busy ? <Paperclip className="h-3 w-3 animate-pulse" /> : <Plus className="h-3 w-3" />}
        Ajouter un fichier
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </section>
  );
}
