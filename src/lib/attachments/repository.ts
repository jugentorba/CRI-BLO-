// Fichiers supplémentaires attachés à un CRI (PDF, Word, Excel, images, …).
// Persistés dans IndexedDB pour survivre au rechargement et fonctionner hors-ligne.
// Ne sont JAMAIS écrits dans l'Excel — inclus uniquement dans l'export ZIP.

import { STORE_ATTACHMENTS, reqAsync, tx } from "@/lib/db";

export interface AttachmentRecord {
  id: string; // `${criId}/${uid}`
  criId: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  blob: Blob;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function addAttachment(criId: string, file: File): Promise<AttachmentRecord> {
  // Read the bytes now and persist an independent Blob. Keeping the File object
  // itself can leave mobile WebViews tied to the temporary document-provider URI
  // (USB key, Downloads provider, cloud provider, etc.). The copied Blob remains
  // available in the CRI dossier after the original source is disconnected.
  const type = file.type || "application/octet-stream";
  const blob = new Blob([await file.arrayBuffer()], { type });
  const record: AttachmentRecord = {
    id: `${criId}/${uid()}`,
    criId,
    name: file.name,
    size: blob.size,
    type,
    createdAt: new Date().toISOString(),
    blob,
  };
  await tx(STORE_ATTACHMENTS, "readwrite", (s) => reqAsync(s.add(record)));
  return record;
}

export async function listAttachments(criId: string): Promise<AttachmentRecord[]> {
  const all = (await tx(STORE_ATTACHMENTS, "readonly", (s) =>
    reqAsync(s.getAll()),
  )) as AttachmentRecord[];
  return all.filter((a) => a.criId === criId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function deleteAttachment(id: string): Promise<void> {
  await tx(STORE_ATTACHMENTS, "readwrite", (s) => reqAsync(s.delete(id)));
}

export async function clearAttachments(criId: string): Promise<void> {
  const items = await listAttachments(criId);
  await Promise.all(items.map((a) => deleteAttachment(a.id)));
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}
