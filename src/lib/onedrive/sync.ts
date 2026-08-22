import { exportSyncSnapshot, importSyncSnapshot } from "@/lib/db";
import { downloadFile, uploadFile } from "./graph";
import { getCurrentAccount } from "./auth";
import { isOneDriveConfigured } from "./config";

const SYNC_PATH = "Device Sync/criblo-device-sync.json";

export async function cloudSyncAvailable(): Promise<boolean> {
  return isOneDriveConfigured() && !!(await getCurrentAccount());
}

export async function uploadDeviceSnapshot(): Promise<{ size: number; at: string }> {
  if (!(await cloudSyncAvailable())) throw new Error("Connectez votre compte OneDrive dans Paramètres.");
  const blob = await exportSyncSnapshot();
  await uploadFile(SYNC_PATH, blob);
  return { size: blob.size, at: new Date().toISOString() };
}

export async function restoreDeviceSnapshot(): Promise<{ size: number }> {
  if (!(await cloudSyncAvailable())) throw new Error("Connectez votre compte OneDrive dans Paramètres.");
  const blob = await downloadFile(SYNC_PATH);
  await importSyncSnapshot(blob);
  return { size: blob.size };
}
