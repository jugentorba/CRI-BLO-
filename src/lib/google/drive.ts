import { getGoogleAccessToken } from "./auth";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function headers(json = false): Promise<HeadersInit> {
  const token = await getGoogleAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function findFile(name: string): Promise<string | null> {
  const h = await headers();
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and 'appDataFolder' in parents and trashed=false`);
  const res = await fetch(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&pageSize=10`, { headers: h });
  if (!res.ok) throw new Error(`Google Drive list failed [${res.status}]`);
  const j = (await res.json()) as { files?: Array<{ id: string }> };
  return j.files?.[0]?.id ?? null;
}

async function createUploadSession(name: string, mimeType: string, existingId: string | null): Promise<string> {
  const h = await headers(true);
  const url = existingId
    ? `${UPLOAD}/files/${existingId}?uploadType=resumable`
    : `${UPLOAD}/files?uploadType=resumable`;
  const body = existingId ? { name, mimeType } : { name, mimeType, parents: ["appDataFolder"] };
  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      ...h,
      "X-Upload-Content-Type": mimeType,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Drive session failed [${res.status}]`);
  const location = res.headers.get("Location");
  if (!location) throw new Error("Google Drive n'a pas retourné d'URL d'envoi.");
  return location;
}

export async function uploadGoogleDriveFile(name: string, blob: Blob): Promise<void> {
  const existingId = await findFile(name);
  const session = await createUploadSession(name, blob.type || "application/octet-stream", existingId);
  const chunkSize = 8 * 1024 * 1024;
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + chunkSize, blob.size);
    const chunk = blob.slice(offset, end);
    const res = await fetch(session, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.size),
        "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}`,
      },
      body: chunk,
    });
    if (!(res.ok || res.status === 308)) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Drive upload failed [${res.status}]: ${body}`);
    }
    offset = end;
  }
}

export async function downloadGoogleDriveFile(name: string): Promise<Blob> {
  const id = await findFile(name);
  if (!id) throw new Error("Aucune sauvegarde CRI BLO trouvée dans Google Drive.");
  const h = await headers();
  const res = await fetch(`${DRIVE}/files/${id}?alt=media`, { headers: h });
  if (!res.ok) throw new Error(`Google Drive download failed [${res.status}]`);
  return res.blob();
}
