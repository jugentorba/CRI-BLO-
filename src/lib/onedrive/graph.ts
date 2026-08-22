// Microsoft Graph client — uploads inside the app's sandbox folder
// (/Apps/CRI BLO Assistant/... in the user's OneDrive).

import { getAccessToken } from "./auth";
import { APP_FOLDERS } from "./config";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

// PUT small file (<= 4 MB) via /content endpoint on the app folder.
async function uploadSmall(path: string, blob: Blob): Promise<void> {
  const headers = await authHeaders();
  const url = `${GRAPH}/me/drive/special/approot:/${encodeURI(path)}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OneDrive upload failed [${res.status}]: ${body}`);
  }
}

// Large-file upload session for files > 4 MB (typical ZIP packages).
async function uploadLarge(path: string, blob: Blob): Promise<void> {
  const headers = await authHeaders();
  const sessionRes = await fetch(
    `${GRAPH}/me/drive/special/approot:/${encodeURI(path)}:/createUploadSession`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    },
  );
  if (!sessionRes.ok) {
    throw new Error(`OneDrive session failed [${sessionRes.status}]`);
  }
  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

  const chunkSize = 5 * 1024 * 1024; // 5 MB, must be multiple of 320 KiB
  const total = blob.size;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = blob.slice(offset, end);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(end - offset),
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk,
    });
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => "");
      throw new Error(`OneDrive chunk failed [${res.status}]: ${body}`);
    }
    offset = end;
  }
}

export async function uploadFile(path: string, blob: Blob): Promise<void> {
  if (blob.size > 4 * 1024 * 1024) {
    return uploadLarge(path, blob);
  }
  return uploadSmall(path, blob);
}

// Ensure Drafts/, Excel Exports/, ZIP Packages/ exist inside the app root folder.
export async function ensureAppFolders(): Promise<void> {
  const headers = await authHeaders();
  for (const name of Object.values(APP_FOLDERS)) {
    await fetch(`${GRAPH}/me/drive/special/approot/children`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      }),
    }).catch(() => {
      /* silently ignore — folder may already exist */
    });
  }
}

export async function getSignedInProfile(): Promise<{ mail: string; name: string } | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${GRAPH}/me`, { headers });
    if (!res.ok) return null;
    const j = (await res.json()) as { mail?: string; userPrincipalName?: string; displayName?: string };
    return { mail: j.mail || j.userPrincipalName || "", name: j.displayName || "" };
  } catch {
    return null;
  }
}


export async function downloadFile(path: string): Promise<Blob> {
  const headers = await authHeaders();
  const res = await fetch(`${GRAPH}/me/drive/special/approot:/${encodeURI(path)}:/content`, { headers });
  if (!res.ok) throw new Error(`OneDrive download failed [${res.status}]`);
  return res.blob();
}
