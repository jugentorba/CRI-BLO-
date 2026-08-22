import { getExportDirHandle, saveSettings, setExportDirHandle } from "@/lib/settings/repository";

interface FSAWindow {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

export function isFolderPickerSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as FSAWindow).showDirectoryPicker === "function";
}

export async function pickExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFolderPickerSupported()) return null;
  const w = window as unknown as FSAWindow;
  const handle = await w.showDirectoryPicker!({ mode: "readwrite" });
  await setExportDirHandle(handle);
  await saveSettings({ exportFolderName: handle.name });
  return handle;
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

export async function writeFileToExportFolder(
  fileName: string,
  data: Blob,
): Promise<{ wrote: boolean; folderName?: string }> {
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
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
