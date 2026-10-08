import { Capacitor } from "@capacitor/core";
import { CriBloStorage } from "@/lib/export/native-folder";
import { getExportDirHandle, saveSettings, setExportDirHandle } from "@/lib/settings/repository";

interface FSAWindow {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

export interface ExportFolderSelection {
  name: string;
}

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isFolderPickerSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeAndroid()) return true;
  return typeof (window as unknown as FSAWindow).showDirectoryPicker === "function";
}

export async function pickExportFolder(): Promise<ExportFolderSelection | null> {
  if (isNativeAndroid()) {
    const result = await CriBloStorage.pickFolder();
    if (result.status !== "selected" || !result.name) return null;
    await saveSettings({ exportFolderName: result.name });
    return { name: result.name };
  }

  if (!isFolderPickerSupported()) return null;
  const w = window as unknown as FSAWindow;
  const handle = await w.showDirectoryPicker!({ mode: "readwrite" });
  await setExportDirHandle(handle);
  await saveSettings({ exportFolderName: handle.name });
  return { name: handle.name };
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (h.queryPermission) {
    const cur = await h.queryPermission({ mode: "readwrite" });
    if (cur === "granted") return true;
  }
  if (h.requestPermission) {
    const next = await h.requestPermission({ mode: "readwrite" });
    return next === "granted";
  }
  return true;
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

async function writeNativeFile(
  fileName: string,
  data: Blob,
): Promise<{ wrote: boolean; folderName?: string }> {
  const start = await CriBloStorage.beginWrite({
    fileName,
    mimeType: data.type || "application/octet-stream",
  });
  if (!start.wrote || !start.token) return { wrote: false };

  const token = start.token;
  const chunkSize = 512 * 1024;
  try {
    for (let offset = 0; offset < data.size; offset += chunkSize) {
      const buffer = await data.slice(offset, Math.min(data.size, offset + chunkSize)).arrayBuffer();
      await CriBloStorage.writeChunk({ token, base64: bytesToBase64(buffer) });
    }
    await CriBloStorage.finishWrite({ token });
    return { wrote: true, folderName: start.folderName };
  } catch (error) {
    try {
      await CriBloStorage.abortWrite({ token });
    } catch {
      /* best effort */
    }
    console.warn("CRI BLO native folder export failed", error);
    return { wrote: false };
  }
}

export async function writeFileToExportFolder(
  fileName: string,
  data: Blob,
): Promise<{ wrote: boolean; folderName?: string }> {
  if (isNativeAndroid()) {
    return writeNativeFile(fileName, data);
  }

  const handle = await getExportDirHandle();
  if (!handle) return { wrote: false };
  const ok = await ensurePermission(handle);
  if (!ok) return { wrote: false };
  const file = await handle.getFileHandle(fileName, { create: true });
  const writable = await (file as unknown as { createWritable: () => Promise<WritableStreamDefaultWriter & { write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  await writable.write(data);
  await writable.close();
  return { wrote: true, folderName: handle.name };
}

export function downloadBlob(fileName: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();

  // Android/WebView peut continuer à lire le blob bien après le click.
  // Révoquer l'URL au bout d'une seconde peut tronquer les gros ZIP/XLSX.
  // On retire le DOM tout de suite, mais on garde l'URL assez longtemps pour
  // que le gestionnaire de téléchargement ait fini de copier les octets.
  setTimeout(() => a.remove(), 0);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
