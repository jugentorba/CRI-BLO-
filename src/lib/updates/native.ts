import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeUpdateStatus = "permission_required" | "installed" | "cancelled";

export interface NativeUpdateResult {
  status: NativeUpdateStatus;
  message?: string;
}

interface CriBloUpdaterPlugin {
  downloadAndInstall(options: { url: string; fileName?: string; expectedSize?: number }): Promise<NativeUpdateResult>;
}

const CriBloUpdater = registerPlugin<CriBloUpdaterPlugin>("CriBloUpdater");

export function canInstallUpdateNatively(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function downloadAndInstallUpdate(
  url: string,
  fileName = "CRI-BLO.apk",
  expectedSize?: number,
): Promise<NativeUpdateResult> {
  if (!canInstallUpdateNatively()) {
    throw new Error("L'installation directe est disponible uniquement dans l'application Android CRI BLO.");
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error("URL de mise à jour non sécurisée.");
  }
  const result = await CriBloUpdater.downloadAndInstall({ url, fileName, expectedSize });
  if (!["permission_required", "installed", "cancelled"].includes(result.status)) {
    throw new Error("Android n'a pas confirmé l'installation. La mise à jour reste non vérifiée.");
  }
  return result;
}
