import { getSettings, saveSettings } from "@/lib/settings/repository";
import { uploadDeviceSnapshot } from "./sync";

const DIRTY_KEY = "criblo.cloudBackupDirty";
let running: Promise<void> | null = null;

export function markCloudBackupDirty(): void {
  try {
    localStorage.setItem(DIRTY_KEY, "1");
  } catch {
    /* noop */
  }
}

export function clearCloudBackupDirty(): void {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* noop */
  }
}

function isDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === "1";
  } catch {
    return true;
  }
}

export async function maybeRunAutomaticCloudBackup(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const settings = await getSettings();
    if (!settings.cloudSyncEnabled || !settings.cloudAutoBackupEnabled) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!isDirty()) return;

    const hours = Math.max(1, settings.cloudAutoBackupIntervalHours ?? 6);
    const last = settings.lastCloudBackupAt ? new Date(settings.lastCloudBackupAt).getTime() : 0;
    if (last && Date.now() - last < hours * 60 * 60 * 1000) return;

    // Après un échec, on ne réessaie pas en boucle toutes les 90 s.
    const lastAttempt = settings.lastCloudAttemptAt
      ? new Date(settings.lastCloudAttemptAt).getTime()
      : 0;
    if (settings.lastCloudError && Date.now() - lastAttempt < 5 * 60 * 1000) return;

    try {
      // Never open an authentication popup during an automatic backup.
      const result = await uploadDeviceSnapshot(false);
      clearCloudBackupDirty();
      await saveSettings({
        lastCloudBackupAt: result.at,
        lastCloudAttemptAt: result.at,
        lastCloudError: undefined,
      });
      window.dispatchEvent(
        new CustomEvent("criblo:auto-backup", {
          detail: { ok: true, at: result.at, size: result.size },
        }),
      );
    } catch (error) {
      // On garde la marque « modifié » pour réessayer, mais l'erreur est
      // visible : plus de sauvegarde cloud silencieusement absente.
      const message = error instanceof Error ? error.message : "Sauvegarde cloud impossible.";
      await saveSettings({
        lastCloudAttemptAt: new Date().toISOString(),
        lastCloudError: message,
      });
      window.dispatchEvent(
        new CustomEvent("criblo:auto-backup", { detail: { ok: false, error: message } }),
      );
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
