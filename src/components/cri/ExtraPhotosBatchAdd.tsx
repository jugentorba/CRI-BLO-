import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { savePhoto } from "@/lib/photos/repository";
import { watermarkImage } from "@/lib/photos/watermark";
import { downloadBlob } from "@/lib/export/folder";
import { getCurrentPosition } from "@/lib/geo/gps";
import type { Address, GpsCoords } from "@/lib/cri/types";

function fileCaptureDate(file: File): Date {
  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    const date = new Date(file.lastModified);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function coordinates(gps: GpsCoords | null): string | undefined {
  return gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : undefined;
}

/**
 * Ajout par lot des « Photos supplémentaires (PHOTOS OI) ».
 * Files are processed in a small worker pool to keep mobile memory bounded.
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
    if (!fileList || fileList.length === 0 || busy) return;
    const files = Array.from(fileList);

    const freeSlots: string[] = [];
    for (let index = 1; freeSlots.length < files.length; index += 1) {
      const slot = `photo_extra_${index}`;
      if (!photos[slot]) freeSlots.push(slot);
    }

    const toProcess = files.slice(0, freeSlots.length);
    setBusy(true);
    setProgress({ done: 0, total: toProcess.length });

    try {
      // One best-effort position for this user action; no repeated permission/GPS
      // prompts for every image in the selected batch.
      let batchGps: GpsCoords | null = null;
      try {
        batchGps = await getCurrentPosition();
      } catch {
        // Evidence remains valid and explicitly marks GPS unavailable.
      }

      const results: Array<{ slot: string; blob: Blob; capturedAt: Date }> = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < toProcess.length) {
          const index = cursor++;
          const file = toProcess[index];
          const slot = freeSlots[index];
          const capturedAt = fileCaptureDate(file);
          const isImage =
            file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
          const evidenceBlob =
            watermarkEnabled && isImage
              ? await watermarkImage(file, {
                  date: capturedAt,
                  address,
                  coordinates: coordinates(batchGps),
                })
              : file;

          await savePhoto(criId, slot, evidenceBlob, {
            originalBlob: file,
            capturedAt: capturedAt.toISOString(),
            gps: batchGps,
            address,
            watermarked: watermarkEnabled && isImage,
          });
          results.push({ slot, blob: evidenceBlob, capturedAt });
          setProgress((current) =>
            current ? { ...current, done: current.done + 1 } : current,
          );
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(3, toProcess.length) }, () => worker()),
      );

      const next = { ...photos };
      for (const { slot, blob, capturedAt } of results) {
        next[slot] = slot;
        if (saveToGallery && blob.type.startsWith("image/")) {
          downloadBlob(
            `${slot}-${capturedAt.toISOString().replace(/[:.]/g, "-")}.jpg`,
            blob,
          );
        }
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
        Sélection multiple depuis la galerie ou les fichiers. Les originaux sont conservés et les photos sont placées automatiquement dans les prochains emplacements libres.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </div>
  );
}
