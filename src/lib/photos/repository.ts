import { STORE_PHOTOS, reqAsync, tx } from "@/lib/db";
import type { Address, GpsCoords } from "@/lib/cri/types";

export interface PhotoEvidenceMetadata {
  /** Original, unmodified evidence when the stored `blob` is stamped/annotated. */
  originalBlob?: Blob;
  /** Actual capture/import timestamp when known. */
  capturedAt?: string;
  /** Location associated with this exact photo when known. */
  gps?: GpsCoords | null;
  /** Address associated with this exact photo when known. */
  address?: Address;
  /** Whether `blob` contains the CRI-BLO evidence watermark. */
  watermarked?: boolean;
}

export interface StoredPhoto extends PhotoEvidenceMetadata {
  id: string; // criId:slotId
  criId: string;
  slot: string;
  /** Evidence/working version used by preview and exports. */
  blob: Blob;
  /** Database write time, not necessarily camera capture time. */
  createdAt: string;
}

function uid(criId: string, slot: string) {
  return `${criId}:${slot}`;
}

export async function savePhoto(
  criId: string,
  slot: string,
  blob: Blob,
  metadata: PhotoEvidenceMetadata = {},
): Promise<StoredPhoto> {
  const capturedAt = metadata.capturedAt ?? new Date().toISOString();
  const record: StoredPhoto = {
    id: uid(criId, slot),
    criId,
    slot,
    blob,
    createdAt: new Date().toISOString(),
    ...metadata,
    capturedAt,
  };
  await tx(STORE_PHOTOS, "readwrite", (store) => reqAsync(store.put(record)));
  return record;
}

/**
 * Replace only the evidence/working version while retaining the original and
 * capture metadata. Used by annotation so edits never destroy the source photo.
 */
export async function replacePhotoEvidence(
  criId: string,
  slot: string,
  blob: Blob,
  patch: Partial<PhotoEvidenceMetadata> = {},
): Promise<StoredPhoto> {
  const current = await getPhoto(criId, slot);
  if (!current) return savePhoto(criId, slot, blob, patch);

  return savePhoto(criId, slot, blob, {
    originalBlob: current.originalBlob,
    capturedAt: current.capturedAt,
    gps: current.gps,
    address: current.address,
    watermarked: current.watermarked,
    ...patch,
  });
}

export async function getPhoto(criId: string, slot: string): Promise<StoredPhoto | null> {
  return tx(STORE_PHOTOS, "readonly", async (store) => {
    const record = (await reqAsync(store.get(uid(criId, slot)))) as StoredPhoto | undefined;
    return record ?? null;
  });
}

export async function deletePhoto(criId: string, slot: string): Promise<void> {
  await tx(STORE_PHOTOS, "readwrite", (store) => reqAsync(store.delete(uid(criId, slot))));
}

export async function deleteAllPhotosForCri(criId: string): Promise<void> {
  const all = (await tx(STORE_PHOTOS, "readonly", (store) => reqAsync(store.getAll()))) as StoredPhoto[];
  await tx(STORE_PHOTOS, "readwrite", async (store) => {
    for (const photo of all) {
      if (photo.criId === criId) await reqAsync(store.delete(photo.id));
    }
  });
}

function metadataFrom(photo: StoredPhoto): PhotoEvidenceMetadata {
  return {
    originalBlob: photo.originalBlob,
    capturedAt: photo.capturedAt,
    gps: photo.gps,
    address: photo.address,
    watermarked: photo.watermarked,
  };
}

/** Déplace une photo d'un emplacement vers un autre (l'emplacement source est libéré). */
export async function movePhoto(criId: string, from: string, to: string): Promise<void> {
  const source = await getPhoto(criId, from);
  if (!source) return;
  await savePhoto(criId, to, source.blob, metadataFrom(source));
  await deletePhoto(criId, from);
}

/** Échange deux emplacements (réordonnancement des photos OI). */
export async function swapPhotos(criId: string, a: string, b: string): Promise<void> {
  const [photoA, photoB] = await Promise.all([getPhoto(criId, a), getPhoto(criId, b)]);
  if (photoA && photoB) {
    await savePhoto(criId, a, photoB.blob, metadataFrom(photoB));
    await savePhoto(criId, b, photoA.blob, metadataFrom(photoA));
  } else if (photoA) {
    await movePhoto(criId, a, b);
  } else if (photoB) {
    await movePhoto(criId, b, a);
  }
}
