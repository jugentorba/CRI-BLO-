import { Capacitor, registerPlugin } from "@capacitor/core";
import { getExportDirHandle, saveSettings, setExportDirHandle } from "@/lib/settings/repository";

interface FSAWindow {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

interface NativeExportPlugin {
  pickDirectory(): Promise<{ cancelled?: boolean; name?: string }>;
  getDirectory(): Promise<{ selected?: boolean; name?: string }>;
  beginFile(options: { fileName: string; mimeType: string }): Promise<{ ready?: boolean; folderName?: string }>;
  appendChunk(options: { dataBase64: string }): Promise<{ written?: number }>;
  finishFile(): Promise<{
    wrote?: boolean;
    folderName?: string;
    bytesWritten?: number;
    fileSize?: number;
  }>;
  abortFile(): Promise<void>;
  beginOpenFile(options: { fileName: string; mimeType: string }): Promise<{ ready?: boolean }>;
  appendOpenChunk(options: { dataBase64: string }): Promise<{ written?: number }>;
  finishOpenFile(): Promise<{ opened?: boolean; bytesWritten?: number; fileSize?: number }>;
  abortOpenFile(): Promise<void>;
}

export interface PickedExportFolder {
  name: string;
}

const CRIExport = registerPlugin<NativeExportPlugin>("CRIExport");

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isFolderPickerSupported(): boolean {
  if (isAndroidNative()) return true;
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as FSAWindow).showDirectoryPicker === "function";
}

export async function pickExportFolder(): Promise<PickedExportFolder | null> {
  if (isAndroidNative()) {
    const result = await CRIExport.pickDirectory();
    if (result.cancelled || !result.name) return null;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + step, bytes.length)));
  }
  return btoa(binary);
}

async function writeFileToAndroidFolder(
  fileName: string,
  data: Blob,
): Promise<{ wrote: boolean; folderName?: string }> {
  const directory = await CRIExport.getDirectory();
  if (!directory.selected) return { wrote: false };

  let begun = false;
  try {
    const start = await CRIExport.beginFile({
      fileName,
      mimeType: data.type || "application/octet-stream",
    });
    if (!start.ready) return { wrote: false };
    begun = true;

    // Keep each native bridge message small. CRI ZIP/XLSX files can contain
    // many full-resolution photos and can otherwise exceed WebView JSON limits.
    const bytes = new Uint8Array(await data.arrayBuffer());
    const chunkSize = 192 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      await CRIExport.appendChunk({ dataBase64: bytesToBase64(chunk) });
    }

    const finished = await CRIExport.finishFile();
    begun = false;
    const expectedSize = data.size;
    if (finished.wrote !== true || finished.bytesWritten !== expectedSize) {
      throw new Error("Export Android incomplet : nombre d'octets incorrect.");
    }
    if (
      typeof finished.fileSize === "number" &&
      finished.fileSize >= 0 &&
      finished.fileSize !== expectedSize
    ) {
      throw new Error("Export Android incomplet : taille du fichier incorrecte.");
    }
    return {
      wrote: true,
      folderName: finished.folderName ?? start.folderName ?? directory.name,
    };
  } catch {
    if (begun) {
      try {
        await CRIExport.abortFile();
      } catch {
        /* best effort */
      }
    }
    return { wrote: false };
  }
}

export function isNativeExternalOpenSupported(): boolean {
  return isAndroidNative();
}

export async function openBlobWithNativeApp(fileName: string, data: Blob): Promise<boolean> {
  if (!isAndroidNative()) return false;

  let begun = false;
  try {
    const start = await CRIExport.beginOpenFile({
      fileName,
      mimeType: data.type || "application/octet-stream",
    });
    if (!start.ready) return false;
    begun = true;

    const bytes = new Uint8Array(await data.arrayBuffer());
    const chunkSize = 192 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      const result = await CRIExport.appendOpenChunk({ dataBase64: bytesToBase64(chunk) });
      if (result.written !== chunk.length) {
        throw new Error("Copie temporaire Android incomplète.");
      }
    }

    const finished = await CRIExport.finishOpenFile();
    begun = false;
    if (finished.opened !== true || finished.bytesWritten !== data.size) return false;
    if (
      typeof finished.fileSize === "number" &&
      finished.fileSize >= 0 &&
      finished.fileSize !== data.size
    ) {
      return false;
    }
    return true;
  } catch {
    if (begun) {
      try {
        await CRIExport.abortOpenFile();
      } catch {
        /* best effort */
      }
    }
    return false;
  }
}

export async function writeFileToExportFolder(
  fileName: string,
  data: Blob,
): Promise<{ wrote: boolean; folderName?: string }> {
  if (isAndroidNative()) return writeFileToAndroidFolder(fileName, data);

  const handle = await getExportDirHandle();
  if (!handle) return { wrote: false };
  const ok = await ensurePermission(handle);
  if (!ok) return { wrote: false };
  const file = await handle.getFileHandle(fileName, { create: true });
  const writable = await (file as unknown as {
    createWritable: () => Promise<
      WritableStreamDefaultWriter & {
        write: (d: Blob) => Promise<void>;
        close: () => Promise<void>;
      }
    >;
  }).createWritable();
  await writable.write(data);
  await writable.close();
  return { wrote: true, folderName: handle.name };
}

export function downloadBlob(fileName: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
