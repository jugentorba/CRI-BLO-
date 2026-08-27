import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Camera, MediaTypeSelection, type MediaResult } from "@capacitor/camera";
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

function isIos(): boolean {
  if (Capacitor.getPlatform() === "ios") return true;
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function extensionFor(result: MediaResult, blob: Blob): string {
  const raw = result.metadata?.format?.toLowerCase() || blob.type.split("/")[1]?.toLowerCase() || "jpg";
  if (raw === "jpeg") return "jpg";
  return raw.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function nativeGalleryFiles(): Promise<File[]> {
  const { results } = await Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: true,
    limit: 0,
    includeMetadata: true,
    correctOrientation: true,
    presentationStyle: "fullscreen",
  });

  const files: File[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const response = await fetch(result.webPath);
    if (!response.ok) throw new Error(`Lecture photo impossible (${response.status})`);
    const blob = await response.blob();
    const creationDate = result.metadata?.creationDate
      ? new Date(result.metadata.creationDate)
      : new Date();
    const safeDate = Number.isNaN(creationDate.getTime()) ? new Date() : creationDate;
    const extension = extensionFor(result, blob);
    const mimeType = blob.type || (extension === "jpg" ? "image/jpeg" : `image/${extension}`);
    files.push(
      new File([blob], `photo-${safeDate.getTime()}-${index + 1}.${extension}`, {
        type: mimeType,
        lastModified: safeDate.getTime(),
      }),
    );
  }
  return files;
}

/**
 * Ajout par lot des « Photos supplémentaires (PHOTOS OI) ».
 * iOS uses the native photo picker in Capacitor builds. PWA/Safari uses an
 * image-only multiple file input so the Photos library offers multi-selection.
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function processFiles(files: File[]) {
    if (files.length === 0 || busy) return;

    const freeSlots: string[] = [];
    for (let index = 1; freeSlots.length < files.length; index += 1) {
      const slot = `photo_extra_${index}`;
      if (!photos[slot]) freeSlots.push(slot);
    }

    const toProcess = files.slice(0, freeSlots.length);
    setBusy(true);
    setErrorMessage(null);
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
      let failed = 0;

      const worker = async () => {
        while (cursor < toProcess.length) {
          const index = cursor++;
          const file = toProcess[index];
          const slot = freeSlots[index];
          const capturedAt = fileCaptureDate(file);
          const isImage =
            file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);

          try {
            let evidenceBlob: Blob = file;
            let watermarked = false;
            if (watermarkEnabled && isImage) {
              try {
                evidenceBlob = await watermarkImage(file, {
                  date: capturedAt,
                  address,
                  coordinates: coordinates(batchGps),
                });
                watermarked = true;
              } catch {
                // iOS can hand back HEIC/very large files that WebKit cannot
                // decode through canvas. Keep the original instead of losing
                // the entire selected batch.
                evidenceBlob = file;
              }
            }

            await savePhoto(criId, slot, evidenceBlob, {
              originalBlob: file,
              capturedAt: capturedAt.toISOString(),
              gps: batchGps,
              address,
              watermarked,
            });
            results.push({ slot, blob: evidenceBlob, capturedAt });
          } catch {
            failed += 1;
          } finally {
            setProgress((current) =>
              current ? { ...current, done: current.done + 1 } : current,
            );
          }
        }
      };

      // iPhone/iPad: process one image at a time. Parallel canvas decoding of
      // several full-resolution photos is a common source of WebKit memory
      // pressure and silent picker failures. Other platforms keep two workers.
      const concurrency = isIos() ? 1 : Math.min(2, toProcess.length);
      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const next = { ...photos };
      for (const { slot, blob, capturedAt } of results) {
        next[slot] = slot;
        if (saveToGallery && blob.type.startsWith("image/")) {
          try {
            downloadBlob(
              `${slot}-${capturedAt.toISOString().replace(/[:.]/g, "-")}.jpg`,
              blob,
            );
          } catch {
            // Saving a copy is optional and must never cancel the evidence add.
          }
        }
      }
      onPhotosChange(next);

      if (failed > 0) {
        setErrorMessage(
          failed === 1
            ? "1 photo n'a pas pu être ajoutée. Les autres ont été conservées."
            : `${failed} photos n'ont pas pu être ajoutées. Les autres ont été conservées.`,
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function choosePhotos() {
    if (busy) return;
    setErrorMessage(null);

    if (!Capacitor.isNativePlatform()) {
      inputRef.current?.click();
      return;
    }

    try {
      const files = await nativeGalleryFiles();
      await processFiles(files);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
      if (code === "OS-PLUG-CAMR-0020") return;
      setErrorMessage(
        "Impossible d'ouvrir ou de lire la photothèque. Vérifiez l'autorisation Photos de CRI BLO puis réessayez.",
      );
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
      <button
        type="button"
        onClick={() => void choosePhotos()}
        disabled={busy}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground transition active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
        {busy && progress
          ? `Ajout ${progress.done}/${progress.total}…`
          : "Ajouter plusieurs photos"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Sélectionnez plusieurs images en une seule fois dans Photos. Les originaux sont conservés et placés automatiquement dans les prochains emplacements libres.
      </p>
      {errorMessage ? (
        <p className="mt-2 text-xs font-medium text-destructive">{errorMessage}</p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void processFiles(Array.from(event.target.files ?? []))}
      />
    </div>
  );
}
