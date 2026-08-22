// Récupération serveur d'un fichier distant pour le navigateur intégré
// (contourne les restrictions CORS du navigateur).

export type FetchFileResult =
  | { ok: true; fileName: string; mimeType: string; base64: string }
  | { ok: false; message: string };

const MAX_BYTES = 12 * 1024 * 1024;

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
  let res: Response;
  try {
    res = await fetch(parsed.toString(), { redirect: "follow" });
  } catch {
    return { ok: false, message: "Téléchargement impossible (site inaccessible)." };
  }
  if (!res.ok) return { ok: false, message: `Téléchargement refusé (${res.status}).` };

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, message: "Fichier trop volumineux (max 12 Mo)." };
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return {
    ok: true,
    fileName: fileNameFrom(parsed.toString(), res.headers.get("content-disposition"), mimeType),
    mimeType,
    base64: btoa(binary),
  };
}
