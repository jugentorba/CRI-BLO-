import { getNativeBrowserStateJson, hasNativeCriBrowser, restoreNativeBrowserState } from "@/lib/browser/native";
import { getCurrentAccount } from "@/lib/onedrive/auth";
import { APP_FOLDERS, isOneDriveConfigured } from "@/lib/onedrive/config";
import { downloadFile, ensureAppFolders, uploadFile } from "@/lib/onedrive/graph";

const BROWSER_BACKUP_PATH = `${APP_FOLDERS.browser}/browser-state.json`;

function updatedAt(raw: string): number {
  try {
    const value = JSON.parse(raw) as { version?: unknown; updatedAt?: unknown };
    if (value.version !== 1) return 0;
    const stamp = Number(value.updatedAt ?? 0);
    return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
  } catch {
    return 0;
  }
}

async function canSync(): Promise<boolean> {
  if (!hasNativeCriBrowser() || !isOneDriveConfigured()) return false;
  return Boolean(await getCurrentAccount());
}

export async function syncNativeBrowserBeforeOpen(): Promise<
  "disabled" | "restored" | "uploaded" | "current"
> {
  if (!(await canSync())) return "disabled";
  const localRaw = await getNativeBrowserStateJson();
  const localStamp = updatedAt(localRaw);
  await ensureAppFolders();

  try {
    const cloudBlob = await downloadFile(BROWSER_BACKUP_PATH);
    const cloudRaw = await cloudBlob.text();
    const cloudStamp = updatedAt(cloudRaw);
    if (cloudStamp > localStamp) {
      const applied = await restoreNativeBrowserState(cloudRaw);
      return applied ? "restored" : "current";
    }
    if (localStamp > cloudStamp && localStamp > 0) {
      await uploadFile(BROWSER_BACKUP_PATH, new Blob([localRaw], { type: "application/json" }));
      return "uploaded";
    }
    return "current";
  } catch {
    if (localStamp > 0) {
      try {
        await uploadFile(BROWSER_BACKUP_PATH, new Blob([localRaw], { type: "application/json" }));
        return "uploaded";
      } catch {
        return "current";
      }
    }
    return "current";
  }
}

export async function backupNativeBrowserToCloud(): Promise<boolean> {
  if (!(await canSync())) return false;
  const stateJson = await getNativeBrowserStateJson();
  if (!updatedAt(stateJson)) return false;
  await ensureAppFolders();
  await uploadFile(BROWSER_BACKUP_PATH, new Blob([stateJson], { type: "application/json" }));
  return true;
}
