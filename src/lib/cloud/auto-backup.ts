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
    const last = settings.lastSyncAt ? new Date(settings.lastSyncAt).getTime() : 0;
    if (last && Date.now() - last < hours * 60 * 60 * 1000) return;

    try {
      // Never open an authentication popup during an automatic backup.
      const result = await uploadDeviceSnapshot(false);
      clearCloudBackupDirty();
      await saveSettings({ lastSyncAt: result.at });
      window.dispatchEvent(
        new CustomEvent("criblo:auto-backup", {
          detail: { ok: true, at: result.at, size: result.size },
        }),
      );
    } catch {
      // Expected when a cloud login needs user interaction. Keep the dirty flag
      // so the next foreground/manual backup can retry without losing anything.
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
