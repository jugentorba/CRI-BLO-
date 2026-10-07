import { Capacitor, CapacitorHttp } from "@capacitor/core";

// Récupération native/web d'un fichier distant pour le navigateur intégré
// (contourne les restrictions CORS du navigateur).

export type FetchFileResult =
  | { ok: true; fileName: string; mimeType: string; base64: string }
  | { ok: false; message: string };

const MAX_BYTES = 12 * 1024 * 1024;


function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function nativeDataToArrayBuffer(data: unknown): ArrayBuffer {
  if (typeof data === "string") return base64ToArrayBuffer(data);
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return new TextEncoder().encode(JSON.stringify(data ?? "")).buffer;
}

function fileNameFrom(url: string, disposition: string | null, mime: string): string {
  const fromHeader = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  if (fromHeader) return decodeURIComponent(fromHeader.trim());
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
  } catch {
    /* url invalide */
  }
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("sheet") ? "xlsx" : "bin";
  return `telechargement.${ext}`;
}

export async function fetchRemoteFile(url: string): Promise<FetchFileResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "Adresse invalide." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: "Protocole non supporté." };
  }
  let status: number;
  let finalUrl = parsed.toString();
  let headers: Record<string, string> = {};
  let buffer: ArrayBuffer;

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url: parsed.toString(),
        responseType: "arraybuffer",
        connectTimeout: 15000,
        readTimeout: 120000,
      });
      status = res.status;
      finalUrl = res.url || finalUrl;
      headers = res.headers;
      buffer = nativeDataToArrayBuffer(res.data);
    } else {
      const res = await fetch(parsed.toString(), { redirect: "follow" });
      status = res.status;
      finalUrl = res.url || finalUrl;
      headers = Object.fromEntries(res.headers.entries());
      buffer = await res.arrayBuffer();
    }
  } catch {
    return { ok: false, message: "Téléchargement impossible (site inaccessible)." };
  }

  if (status < 200 || status >= 300) {
    return { ok: false, message: `Téléchargement refusé (${status}).` };
  }
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, message: "Fichier trop volumineux (max 12 Mo)." };
  }
  const mimeType = headerValue(headers, "content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return {
    ok: true,
    fileName: fileNameFrom(finalUrl, headerValue(headers, "content-disposition"), mimeType),
    mimeType,
    base64: btoa(binary),
  };
}
