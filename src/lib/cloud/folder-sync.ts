import { Capacitor } from "@capacitor/core";
import { exportSyncSnapshot, importSyncSnapshot } from "@/lib/db";
import { CriBloStorage } from "@/lib/export/native-folder";
import { getSettings, saveSettings } from "@/lib/settings/repository";

const CLOUD_SNAPSHOT_NAME = "CRI-BLO-cloud-backup.json";
const WRITE_CHUNK_BYTES = 384 * 1024;

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function nativeCloudFolderSupported(): boolean {
  return isNativeAndroid();
}

export async function pickCloudBackupFolder(): Promise<{ name: string } | null> {
  if (!isNativeAndroid()) {
    throw new Error("Le dossier cloud sans OAuth est disponible dans l'application Android CRI BLO.");
  }
  const picked = await CriBloStorage.pickFolder({ scope: "cloud" });
  if (picked.status !== "selected" || !picked.name) return null;
  await saveSettings({
    cloudProvider: "cloud-folder",
    cloudFolderName: picked.name,
    cloudSyncEnabled: true,
    cloudAutoBackupEnabled: true,
  });
  return { name: picked.name };
}

async function ensureCloudFolder(interactive: boolean): Promise<string> {
  const settings = await getSettings();
  if (settings.cloudFolderName) return settings.cloudFolderName;
  if (!interactive) throw new Error("Dossier cloud CRI BLO non sélectionné.");
  const picked = await pickCloudBackupFolder();
  if (!picked) throw new Error("Sélection du dossier cloud annulée.");
  return picked.name;
}

export async function uploadCloudFolderSnapshot(
  interactive = true,
): Promise<{ size: number; at: string }> {
  if (!isNativeAndroid()) {
    throw new Error("La sauvegarde par dossier cloud est disponible dans l'application Android.");
  }
  await ensureCloudFolder(interactive);

  const blob = await exportSyncSnapshot();
  const start = await CriBloStorage.beginWrite({
    scope: "cloud",
    fileName: CLOUD_SNAPSHOT_NAME,
    mimeType: "application/json",
  });
  if (!start.wrote || !start.token) {
    if (!interactive) throw new Error("Accès au dossier cloud expiré.");
    await saveSettings({ cloudFolderName: undefined });
    await ensureCloudFolder(true);
    return uploadCloudFolderSnapshot(false);
  }

  try {
    for (let offset = 0; offset < blob.size; offset += WRITE_CHUNK_BYTES) {
      const part = blob.slice(offset, Math.min(blob.size, offset + WRITE_CHUNK_BYTES));
      await CriBloStorage.writeChunk({
        token: start.token,
        base64: bytesToBase64(await part.arrayBuffer()),
      });
    }
    await CriBloStorage.finishWrite({ token: start.token });
  } catch (error) {
    try {
      await CriBloStorage.abortWrite({ token: start.token });
    } catch {
      /* best effort */
    }
    throw error;
  }

  const at = new Date().toISOString();
  await saveSettings({
    cloudProvider: "cloud-folder",
    cloudFolderName: start.folderName || (await getSettings()).cloudFolderName,
    cloudSyncEnabled: true,
    lastCloudBackupAt: at,
  });
  return { size: blob.size, at };
}

export async function restoreCloudFolderSnapshot(
  interactive = true,
): Promise<{ size: number }> {
  if (!isNativeAndroid()) {
    throw new Error("La restauration par dossier cloud est disponible dans l'application Android.");
  }
  await ensureCloudFolder(interactive);

  let start = await CriBloStorage.beginRead({
    scope: "cloud",
    fileName: CLOUD_SNAPSHOT_NAME,
  });
  if (!start.found || !start.token) {
    if (interactive) {
      await saveSettings({ cloudFolderName: undefined });
      await ensureCloudFolder(true);
      start = await CriBloStorage.beginRead({ scope: "cloud", fileName: CLOUD_SNAPSHOT_NAME });
    }
  }
  if (!start.found || !start.token) {
    throw new Error("Aucune sauvegarde CRI BLO trouvée dans ce dossier cloud.");
  }

  const token = start.token;
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await CriBloStorage.readChunk({ token });
      if (chunk.base64) {
        const bytes = base64ToBytes(chunk.base64);
        parts.push(bytes);
        size += bytes.byteLength;
      }
      if (chunk.done) break;
    }
  } finally {
    try {
      await CriBloStorage.finishRead({ token });
    } catch {
      /* stream may already be closed at EOF */
    }
  }

  if (!size) throw new Error("La sauvegarde cloud est vide.");
  const blob = new Blob(parts as BlobPart[], { type: "application/json" });
  await importSyncSnapshot(blob);
  await saveSettings({
    cloudProvider: "cloud-folder",
    cloudFolderName: start.folderName || (await getSettings()).cloudFolderName,
    cloudSyncEnabled: true,
  });
  return { size };
}
