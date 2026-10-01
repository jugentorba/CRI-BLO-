import { getSettings } from "@/lib/settings/repository";
import {
  uploadDeviceSnapshot as uploadOneDriveSnapshot,
  restoreDeviceSnapshot as restoreOneDriveSnapshot,
} from "@/lib/onedrive/sync";
import {
  uploadGoogleDeviceSnapshot,
  restoreGoogleDeviceSnapshot,
} from "@/lib/google/sync";

export async function uploadDeviceSnapshot(): Promise<{ size: number; at: string }> {
  const settings = await getSettings();
  if (settings.cloudProvider === "google-drive") return uploadGoogleDeviceSnapshot();
  return uploadOneDriveSnapshot();
}

export async function restoreDeviceSnapshot(): Promise<{ size: number }> {
  const settings = await getSettings();
  if (settings.cloudProvider === "google-drive") return restoreGoogleDeviceSnapshot();
  return restoreOneDriveSnapshot();
}
