import { Capacitor, registerPlugin } from "@capacitor/core";
import { downloadBlob } from "@/lib/export/folder";

interface FilesPlugin {
  beginOpen(options: { fileName: string; mimeType: string }): Promise<{ token: string }>;
  writeChunk(options: { token: string; base64: string }): Promise<void>;
  finishOpen(options: { token: string }): Promise<void>;
  abortOpen(options: { token: string }): Promise<void>;
}
const Files = registerPlugin<FilesPlugin>("CriBloFiles");

export function attachmentMimeType(name: string, supplied?: string): string {
  if (supplied && supplied !== "application/octet-stream") return supplied;
  const types: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", txt: "text/plain", csv: "text/csv", zip: "application/zip",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return types[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export async function openAttachment(file: { name: string; type?: string; blob: Blob }): Promise<void> {
  const mimeType = attachmentMimeType(file.name, file.type || file.blob.type);
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const { token } = await Files.beginOpen({ fileName: file.name, mimeType });
    try {
      const chunkSize = 384 * 1024;
      for (let offset = 0; offset < file.blob.size; offset += chunkSize) {
        const bytes = new Uint8Array(await file.blob.slice(offset, offset + chunkSize).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        await Files.writeChunk({ token, base64: btoa(binary) });
      }
      await Files.finishOpen({ token });
    } catch (error) {
      await Files.abortOpen({ token }).catch(() => {});
      throw error;
    }
    return;
  }
  if (/Android/i.test(navigator.userAgent)) {
    const sharedFile = new File([file.blob], file.name, { type: mimeType });
    if (navigator.canShare?.({ files: [sharedFile] })) {
      try {
        await navigator.share({ files: [sharedFile], title: file.name });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
  }
  if (/^(application\/pdf|image\/|text\/)/.test(mimeType)) {
    const url = URL.createObjectURL(new Blob([file.blob], { type: mimeType }));
    const opened = window.open(url, "_blank");
    if (opened) {
      opened.opener = null;
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }
    URL.revokeObjectURL(url);
  }
  downloadBlob(file.name, file.blob);
}
