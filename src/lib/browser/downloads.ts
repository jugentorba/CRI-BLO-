// Gestionnaire de téléchargements du navigateur intégré.
// Store IndexedDB dédié : aucun lien avec les pièces jointes CRI BLO.

import { STORE_DOWNLOADS, reqAsync, tx } from "@/lib/db";

export interface DownloadRecord {
  id: string;
  fileName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
  blob: Blob;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveDownload(
  input: Omit<DownloadRecord, "id" | "createdAt" | "size">,
): Promise<DownloadRecord> {
  const record: DownloadRecord = {
    id: uid(),
    createdAt: new Date().toISOString(),
    size: input.blob.size,
    ...input,
  };
  await tx(STORE_DOWNLOADS, "readwrite", (s) => reqAsync(s.put(record)));
  return record;
}

export async function listDownloads(): Promise<DownloadRecord[]> {
  const all = (await tx(STORE_DOWNLOADS, "readonly", (s) =>
    reqAsync(s.getAll()),
  )) as DownloadRecord[];
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteDownload(id: string): Promise<void> {
  await tx(STORE_DOWNLOADS, "readwrite", (s) => reqAsync(s.delete(id)));
}

export async function clearDownloads(): Promise<void> {
  await tx(STORE_DOWNLOADS, "readwrite", (s) => reqAsync(s.clear()));
}

/** Ouvre / enregistre un fichier téléchargé sur l'appareil. */
export function openDownload(record: DownloadRecord): void {
  const url = URL.createObjectURL(record.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = record.fileName;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
