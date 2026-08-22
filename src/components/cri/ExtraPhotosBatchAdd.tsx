import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { savePhoto } from "@/lib/photos/repository";
import { watermarkImage } from "@/lib/photos/watermark";
import { downloadBlob } from "@/lib/export/folder";
import type { Address } from "@/lib/cri/types";

/**
 * Ajout par lot des « Photos supplémentaires (PHOTOS OI) ».
 * Sélectionne plusieurs photos depuis la galerie en une fois et les place
 * automatiquement dans les prochains emplacements libres photo_extra_N.
 * Ne modifie pas les autres slots ni la logique d'export.
 */
export function ExtraPhotosBatchAdd({
  criId,
  address,
  watermarkEnabled,
  saveToGallery,
  photos,
  onPhotosChange,
}: {
  criId: string;
  address: Address;
  watermarkEnabled: boolean;
  saveToGallery: boolean;
  photos: Record<string, string>;
  onPhotosChange: (next: Record<string, string>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // Emplacements libres, dans l'ordre.
    const freeSlots: string[] = [];
    for (let i = 1; freeSlots.length < files.length; i++) {
      const slot = `photo_extra_${i}`;
      if (!photos[slot]) freeSlots.push(slot);
    }

    const toProcess = files.slice(0, freeSlots.length);
    setBusy(true);
    setProgress({ done: 0, total: toProcess.length });
    try {
      // Process a few images concurrently so the UI does not feel blocked,
      // while still avoiding a large memory spike on mobile devices.
      const results: Array<{ slot: string; blob: Blob }> = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < toProcess.length) {
          const i = cursor++;
          const file = toProcess[i];
          const slot = freeSlots[i];
          const isImage =
            file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
          const blob =
            watermarkEnabled && isImage
              ? await watermarkImage(file, { date: new Date(), address })
              : file;
          await savePhoto(criId, slot, blob);
          results.push({ slot, blob });
          setProgress((p) => p ? { ...p, done: p.done + 1 } : p);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, toProcess.length) }, () => worker()));
      const next = { ...photos };
      for (const { slot, blob } of results) {
        next[slot] = slot;
        if (saveToGallery) downloadBlob(`${slot}-${Date.now()}.jpg`, blob);
      }
      onPhotosChange(next);
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
        {busy && progress
          ? `Ajout ${progress.done}/${progress.total}…`
          : "Ajouter plusieurs photos / fichiers"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Sélection multiple depuis la galerie, les téléchargements, les fichiers, Gmail ou Drive —
        les photos sont placées automatiquement dans les prochains emplacements libres.
      </p>
      {/* Sélecteur Android complet (Galerie, Téléchargements, Fichiers, Gmail, Drive…) */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
