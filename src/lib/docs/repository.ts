// Historique des documents NON CRI BLO (D15, types inconnus…).
// Store IndexedDB dédié : aucun mélange avec l'historique CRI BLO.

import { STORE_OTHER_DOCS, reqAsync, tx } from "@/lib/db";
import type { DocTypeId } from "@/lib/docs/registry";

export interface OtherDocRecord {
  id: string;
  docType: DocTypeId;
  fileName: string;
  kind: "xlsx" | "pdf" | "docx" | "autre";
  createdAt: string;
  confidence: number;
  reasons: string[];
  detectedFields?: { id: string; label: string; value: string }[];
  textPreview?: string;
  note?: string;
  /** Fichier d'origine conservé pour pouvoir l'ouvrir plus tard. */
  blob?: Blob;
  mimeType?: string;
  size?: number;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveOtherDoc(
  partial: Omit<OtherDocRecord, "id" | "createdAt"> & { createdAt?: string },
): Promise<OtherDocRecord> {
  const record: OtherDocRecord = {
    id: uid(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    ...partial,
  };
  await tx(STORE_OTHER_DOCS, "readwrite", (s) => reqAsync(s.add(record)));
  return record;
}

export async function listOtherDocs(docType?: DocTypeId): Promise<OtherDocRecord[]> {
  const all = (await tx(STORE_OTHER_DOCS, "readonly", (s) =>
    reqAsync(s.getAll()),
  )) as OtherDocRecord[];
  const filtered = docType ? all.filter((d) => d.docType === docType) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteOtherDoc(id: string): Promise<void> {
  await tx(STORE_OTHER_DOCS, "readwrite", (s) => reqAsync(s.delete(id)));
}

export async function getOtherDoc(id: string): Promise<OtherDocRecord | undefined> {
  return (await tx(STORE_OTHER_DOCS, "readonly", (s) =>
    reqAsync(s.get(id)),
  )) as OtherDocRecord | undefined;
}

/** Ouvre / enregistre le fichier d'origine conservé avec le document. */
export function openOtherDocFile(record: OtherDocRecord): boolean {
  if (!record.blob) return false;
  const url = URL.createObjectURL(record.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = record.fileName;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
