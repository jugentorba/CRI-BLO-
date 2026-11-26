import { exportSyncSnapshot, importSyncSnapshot } from "@/lib/db";
import { getGoogleAccessToken } from "./auth";
import { isGoogleDriveConfigured } from "./config";
import { downloadGoogleDriveFile, uploadGoogleDriveFile } from "./drive";

const SYNC_FILE = "criblo-device-sync.json";

export async function googleDriveSyncAvailable(interactive = true): Promise<boolean> {
  if (!isGoogleDriveConfigured()) return false;
  try {
    // Un jeton suffit : l'ancienne version exigeait un appel userinfo qui
    // pouvait échouer et faisait croire que le compte n'était pas connecté.
    await getGoogleAccessToken(interactive);
    return true;
  } catch {
    return false;
  }
}

export async function uploadGoogleDeviceSnapshot(interactive = true): Promise<{ size: number; at: string }> {
  if (!(await googleDriveSyncAvailable(interactive))) {
    throw new Error("Connectez votre compte Google Drive dans Paramètres.");
  }
  const blob = await exportSyncSnapshot();
  await uploadGoogleDriveFile(SYNC_FILE, blob, interactive);
  return { size: blob.size, at: new Date().toISOString() };
}

export async function restoreGoogleDeviceSnapshot(): Promise<{ size: number }> {
  if (!(await googleDriveSyncAvailable())) {
    throw new Error("Connectez votre compte Google Drive dans Paramètres.");
  }
  const blob = await downloadGoogleDriveFile(SYNC_FILE);
  await importSyncSnapshot(blob);
  return { size: blob.size };
}
