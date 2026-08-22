import { STORE_CRIS, reqAsync, tx } from "@/lib/db";
import type { Address, CriRecord } from "./types";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCri(
  partial: Omit<CriRecord, "id" | "createdAt"> & { createdAt?: string },
): Promise<CriRecord> {
  const now = new Date().toISOString();
  const record: CriRecord = {
    id: uid(),
    createdAt: partial.createdAt ?? now,
    ...partial,
  };
  await tx(STORE_CRIS, "readwrite", (s) => reqAsync(s.add(record)));
  return record;
}

export async function updateCri(id: string, patch: Partial<CriRecord>): Promise<CriRecord> {
  return tx(STORE_CRIS, "readwrite", async (s) => {
    const existing = (await reqAsync(s.get(id))) as CriRecord | undefined;
    if (!existing) throw new Error(`CRI introuvable: ${id}`);
    const updated: CriRecord = { ...existing, ...patch, id: existing.id };
    await reqAsync(s.put(updated));
    return updated;
  });
}

export async function patchAddress(
  id: string,
  address: Address,
  status: CriRecord["addressStatus"],
): Promise<CriRecord> {
  return updateCri(id, { address, addressStatus: status });
}

export async function getCri(id: string): Promise<CriRecord | null> {
  return tx(STORE_CRIS, "readonly", async (s) => {
    const r = (await reqAsync(s.get(id))) as CriRecord | undefined;
    return r ?? null;
  });
}

export async function listCris(): Promise<CriRecord[]> {
  const items = await tx(STORE_CRIS, "readonly", (s) => reqAsync(s.getAll()));
  return (items as CriRecord[]).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listPendingCris(): Promise<CriRecord[]> {
  const items = (await tx(STORE_CRIS, "readonly", (s) =>
    reqAsync(s.getAll()),
  )) as CriRecord[];
  return items.filter((c) => c.addressStatus === "pending" && c.gps);
}

export async function deleteCri(id: string): Promise<void> {
  await tx(STORE_CRIS, "readwrite", (s) => reqAsync(s.delete(id)));
}

export async function countToday(): Promise<number> {
  const items = await listCris();
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  return items.filter((c) => {
    const dt = new Date(c.createdAt);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  }).length;
}
