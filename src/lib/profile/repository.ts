import { STORE_PROFILE, reqAsync, tx } from "@/lib/db";
import type { TechnicianProfile } from "@/lib/cri/types";

export async function getProfile(): Promise<TechnicianProfile | null> {
  return tx(STORE_PROFILE, "readonly", async (s) => {
    const r = (await reqAsync(s.get("me"))) as TechnicianProfile | undefined;
    return r ?? null;
  });
}

export async function saveProfile(
  data: Partial<Omit<TechnicianProfile, "id" | "updatedAt">>,
): Promise<TechnicianProfile> {
  const existing = (await getProfile()) ?? { id: "me" as const, updatedAt: "" };
  const record: TechnicianProfile = {
    ...existing,
    ...data,
    id: "me",
    updatedAt: new Date().toISOString(),
  };
  await tx(STORE_PROFILE, "readwrite", (s) => reqAsync(s.put(record)));
  return record;
}

export function isProfileComplete(p: TechnicianProfile | null): boolean {
  return !!(p?.company?.trim() && p?.lastName?.trim());
}
