import { STORE_PHOTOS, reqAsync, tx } from "@/lib/db";

export interface StoredPhoto {
  id: string; // criId:slotId
  criId: string;
  slot: string;
  blob: Blob;
  createdAt: string;
}

function uid(criId: string, slot: string) {
  return `${criId}:${slot}`;
}

export async function savePhoto(criId: string, slot: string, blob: Blob): Promise<StoredPhoto> {
  const record: StoredPhoto = {
    id: uid(criId, slot),
    criId,
    slot,
    blob,
    createdAt: new Date().toISOString(),
  };
  await tx(STORE_PHOTOS, "readwrite", (s) => reqAsync(s.put(record)));
  return record;
}

export async function getPhoto(criId: string, slot: string): Promise<StoredPhoto | null> {
  return tx(STORE_PHOTOS, "readonly", async (s) => {
    const r = (await reqAsync(s.get(uid(criId, slot)))) as StoredPhoto | undefined;
    return r ?? null;
  });
}

export async function deletePhoto(criId: string, slot: string): Promise<void> {
  await tx(STORE_PHOTOS, "readwrite", (s) => reqAsync(s.delete(uid(criId, slot))));
}

export async function deleteAllPhotosForCri(criId: string): Promise<void> {
  const all = (await tx(STORE_PHOTOS, "readonly", (s) => reqAsync(s.getAll()))) as StoredPhoto[];
  await tx(STORE_PHOTOS, "readwrite", async (s) => {
    for (const p of all) if (p.criId === criId) await reqAsync(s.delete(p.id));
  });
}

/** Déplace une photo d'un emplacement vers un autre (l'emplacement source est libéré). */
export async function movePhoto(criId: string, from: string, to: string): Promise<void> {
  const src = await getPhoto(criId, from);
  if (!src) return;
  await savePhoto(criId, to, src.blob);
  await deletePhoto(criId, from);
}

/** Échange deux emplacements (réordonnancement des photos OI). */
export async function swapPhotos(criId: string, a: string, b: string): Promise<void> {
  const [pa, pb] = await Promise.all([getPhoto(criId, a), getPhoto(criId, b)]);
  if (pa && pb) {
    await savePhoto(criId, a, pb.blob);
    await savePhoto(criId, b, pa.blob);
  } else if (pa) {
    await movePhoto(criId, a, b);
  } else if (pb) {
    await movePhoto(criId, b, a);
  }
}
