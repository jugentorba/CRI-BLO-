import { useState } from "react";
import { ArrowUp, ArrowDown, Images } from "lucide-react";
import { PhotoSlot } from "@/components/cri/PhotoSlot";
import { ExtraPhotosBatchAdd } from "@/components/cri/ExtraPhotosBatchAdd";
import { deletePhoto, movePhoto, swapPhotos } from "@/lib/photos/repository";
import type { Address } from "@/lib/cri/types";

function extraNumber(slot: string): number | null {
  const m = /^photo_extra_(\d+)$/.exec(slot);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function filledNumbers(photos: Record<string, string>): number[] {
  return Object.keys(photos)
    .map(extraNumber)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
}

/**
 * Section « Photos supplémentaires (PHOTOS OI) ».
 * Nombre de photos, ajout multiple, suppression / remplacement unitaire,
 * réordonnancement. Les emplacements restent toujours photo_extra_1..N sans
 * trou, ce qui garantit l'export inchangé (feuille PHOTOS OI + dossier ZIP).
 */
export function ExtraPhotosSection({
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
  const [version, setVersion] = useState(0);
  const filled = filledNumbers(photos);
  const count = filled.length;
  const slots = [...filled.map((n) => `photo_extra_${n}`), `photo_extra_${count + 1}`];

  function withExtras(nums: number[]): Record<string, string> {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(photos)) if (extraNumber(k) === null) next[k] = v;
    nums.forEach((_, i) => {
      next[`photo_extra_${i + 1}`] = `photo_extra_${i + 1}`;
    });
    return next;
  }

  /** Supprime un emplacement puis recompacte la série (aucun trou). */
  async function handleRemoved(slot: string) {
    const removed = extraNumber(slot);
    if (removed === null) return;
    const remaining = filled.filter((n) => n !== removed);
    // Delete the requested record first. This fixes the last-photo case where
    // the UI could reappear because only the React map was compacted.
    await deletePhoto(criId, slot);
    for (let i = 0; i < remaining.length; i++) {
      const target = i + 1;
      if (remaining[i] !== target) await movePhoto(criId, `photo_extra_${remaining[i]}`, `photo_extra_${target}`);
    }
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(photos)) if (extraNumber(k) === null) next[k] = v;
    for (let i = 0; i < remaining.length; i++) next[`photo_extra_${i + 1}`] = `photo_extra_${i + 1}`;
    onPhotosChange(next);
    setVersion((v) => v + 1);
  }

  async function move(slot: string, dir: -1 | 1) {
    const n = extraNumber(slot);
    if (n === null) return;
    const other = n + dir;
    if (other < 1 || other > count) return;
    await swapPhotos(criId, slot, `photo_extra_${other}`);
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Images className="h-3 w-3 text-primary" />
        {count === 0 ? "Aucune photo OI" : `${count} photo${count > 1 ? "s" : ""} OI`}
      </div>

      <ExtraPhotosBatchAdd
        criId={criId}
        address={address}
        watermarkEnabled={watermarkEnabled}
        saveToGallery={saveToGallery}
        photos={photos}
        onPhotosChange={onPhotosChange}
      />

      {slots.map((slot, idx) => {
        const n = idx + 1;
        const has = !!photos[slot];
        return (
          <div key={`${slot}-${version}`} className="space-y-1">
            <PhotoSlot
              criId={criId}
              slot={slot}
              label={`Photo supplémentaire ${n}`}
              address={address}
              watermarkEnabled={watermarkEnabled}
              saveToGallery={saveToGallery}
              hasPhoto={has}
              onChange={(nextHas) => {
                if (nextHas) onPhotosChange({ ...photos, [slot]: slot });
                else void handleRemoved(slot);
              }}
            />
            {has && count > 1 && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void move(slot, -1)}
                  disabled={n === 1}
                  aria-label="Monter la photo"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(slot, 1)}
                  disabled={n >= count}
                  aria-label="Descendre la photo"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground disabled:opacity-40"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
