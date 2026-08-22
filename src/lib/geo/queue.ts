import { listPendingCris, patchAddress } from "@/lib/cri/repository";
import { reverseGeocode } from "./geocode.functions";

let running = false;

/**
 * Résout les adresses des CRI en attente. Appelé manuellement et automatiquement
 * lorsque la connectivité revient.
 */
export async function resolvePendingAddresses(): Promise<{ resolved: number; failed: number }> {
  if (running) return { resolved: 0, failed: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { resolved: 0, failed: 0 };
  }
  running = true;
  let resolved = 0;
  let failed = 0;
  try {
    const pending = await listPendingCris();
    for (const cri of pending) {
      if (!cri.gps) continue;
      try {
        const address = await reverseGeocode({
          data: { latitude: cri.gps.latitude, longitude: cri.gps.longitude },
        });
        await patchAddress(cri.id, address, "resolved");
        resolved++;
      } catch {
        failed++;
      }
    }
  } finally {
    running = false;
  }
  return { resolved, failed };
}

let initialized = false;
export function initAddressQueueWatcher(onChange?: () => void) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const trigger = async () => {
    const result = await resolvePendingAddresses();
    if (result.resolved > 0) onChange?.();
  };
  window.addEventListener("online", trigger);
  // Tentative immédiate au démarrage si en ligne.
  if (navigator.onLine) void trigger();
}
