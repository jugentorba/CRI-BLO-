import { STORE_GEOCACHE, reqAsync, tx } from "@/lib/db";
import type { Address } from "@/lib/cri/types";

export interface CachedGeocode {
  key: string; // "lat4,lon4" (≈11 m grid)
  latitude: number;
  longitude: number;
  address: Address;
  updatedAt: string;
  completeness: number; // score 0-5 (more filled fields = higher)
}

/** Round to 4 decimals ≈ 11 m grid — dedupes very-close captures. */
function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function addressCompleteness(a: Address): number {
  let n = 0;
  if (a.streetNumber) n++;
  if (a.street && a.street.trim().toLowerCase() !== "route sans nom") n++;
  if (a.postalCode) n++;
  if (a.commune) n++;
  if (a.country) n++;
  return n;
}

/** Haversine distance in meters. */
function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function getCachedAddressExact(
  latitude: number,
  longitude: number,
): Promise<CachedGeocode | null> {
  return tx(STORE_GEOCACHE, "readonly", async (s) => {
    const r = (await reqAsync(s.get(gridKey(latitude, longitude)))) as CachedGeocode | undefined;
    return r ?? null;
  });
}

/**
 * Nearest cached address within `radiusMeters`. Falls back on exact-grid miss.
 * Prefers the most complete address among nearby candidates.
 */
export async function getNearestCachedAddress(
  latitude: number,
  longitude: number,
  radiusMeters = 60,
): Promise<CachedGeocode | null> {
  const exact = await getCachedAddressExact(latitude, longitude);
  if (exact) return exact;
  const all = (await tx(STORE_GEOCACHE, "readonly", (s) => reqAsync(s.getAll()))) as CachedGeocode[];
  let best: CachedGeocode | null = null;
  let bestScore = -Infinity;
  for (const c of all) {
    const d = distanceMeters({ latitude, longitude }, c);
    if (d > radiusMeters) continue;
    // Score: prefer more complete, then closer.
    const score = c.completeness * 1000 - d;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Save/merge a fresh geocoding result. If a cache entry already exists at the
 * same grid cell, keep whichever address is more complete (fresh wins on tie).
 */
export async function cacheAddress(
  latitude: number,
  longitude: number,
  address: Address,
): Promise<void> {
  const key = gridKey(latitude, longitude);
  const fresh: CachedGeocode = {
    key,
    latitude,
    longitude,
    address,
    updatedAt: new Date().toISOString(),
    completeness: addressCompleteness(address),
  };
  await tx(STORE_GEOCACHE, "readwrite", async (s) => {
    const prev = (await reqAsync(s.get(key))) as CachedGeocode | undefined;
    if (prev && prev.completeness > fresh.completeness) return; // keep richer
    await reqAsync(s.put(fresh));
  });
}
