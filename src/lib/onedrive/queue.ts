// Offline-first upload queue for OneDrive.
// Persists pending uploads in IndexedDB (via STORE_SETTINGS) so the app can
// resume synchronization when the network comes back.

import { STORE_SETTINGS, reqAsync, tx } from "@/lib/db";
import { uploadFile, ensureAppFolders } from "./graph";
import { APP_FOLDERS, isOneDriveConfigured } from "./config";
import { getCurrentAccount } from "./auth";
import { saveSettings } from "@/lib/settings/repository";

export type QueueKind = "excel" | "zip" | "draft" | "attachment";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  path: string; // Path inside AppFolder, e.g. "Excel Exports/CRI_BLO_...xlsx"
  blob: Blob;
  addedAt: string;
  status: "pending" | "syncing" | "error";
  error?: string;
}

const QUEUE_KEY = "onedriveQueue";

interface QueueRecord {
  id: typeof QUEUE_KEY;
  items: QueueItem[];
}

async function readQueue(): Promise<QueueItem[]> {
  const r = await tx(STORE_SETTINGS, "readonly", async (s) => {
    const v = (await reqAsync(s.get(QUEUE_KEY))) as QueueRecord | undefined;
    return v?.items ?? [];
  });
  return r;
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  await tx(STORE_SETTINGS, "readwrite", (s) =>
    reqAsync(s.put({ id: QUEUE_KEY, items } satisfies QueueRecord)),
  );
  try {
    window.dispatchEvent(new CustomEvent("criblo:onedrive-queue", { detail: items.length }));
  } catch {
    /* noop */
  }
}

export function folderFor(kind: QueueKind): string {
  if (kind === "excel") return APP_FOLDERS.excel;
  if (kind === "zip") return APP_FOLDERS.zip;
  return APP_FOLDERS.drafts;
}

export async function enqueueUpload(
  kind: QueueKind,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const path = `${folderFor(kind)}/${fileName}`;
  const items = await readQueue();
  const item: QueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    path,
    blob,
    addedAt: new Date().toISOString(),
    status: "pending",
  };
  items.push(item);
  await writeQueue(items);
}

export async function queueSize(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
}

let draining = false;

export async function drainQueue(): Promise<{ uploaded: number; failed: number }> {
  if (draining) return { uploaded: 0, failed: 0 };
  if (!isOneDriveConfigured()) return { uploaded: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { uploaded: 0, failed: 0 };

  const account = await getCurrentAccount();
  if (!account) return { uploaded: 0, failed: 0 };

  draining = true;
  let uploaded = 0;
  let failed = 0;
  try {
    await ensureAppFolders();
    let items = await readQueue();
    while (items.length) {
      const [next, ...rest] = items;
      try {
        await uploadFile(next.path, next.blob);
        items = rest;
        await writeQueue(items);
        uploaded++;
      } catch (e) {
        // Mark as errored and stop draining to avoid tight retry loops.
        const errored: QueueItem = {
          ...next,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        };
        await writeQueue([errored, ...rest]);
        failed++;
        break;
      }
    }
    if (uploaded > 0) {
      await saveSettings({ lastSyncAt: new Date().toISOString() });
    }
  } finally {
    draining = false;
  }
  return { uploaded, failed };
}
