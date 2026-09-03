// Offline-first upload queue for OneDrive.
// Pending uploads live in IndexedDB so network loss or app interruption does
// not remove evidence before OneDrive confirms a successful upload.

import { STORE_SETTINGS, reqAsync, tx } from "@/lib/db";
import { uploadFile, ensureAppFolders } from "./graph";
import { APP_FOLDERS, isOneDriveConfigured } from "./config";
import { getCurrentAccount } from "./auth";
import { saveSettings } from "@/lib/settings/repository";

export type QueueKind = "excel" | "zip" | "draft" | "attachment";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  path: string;
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
  return tx(STORE_SETTINGS, "readonly", async (store) => {
    const value = (await reqAsync(store.get(QUEUE_KEY))) as QueueRecord | undefined;
    return value?.items ?? [];
  });
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  await tx(STORE_SETTINGS, "readwrite", (store) =>
    reqAsync(store.put({ id: QUEUE_KEY, items } satisfies QueueRecord)),
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
  const existingIndex = items.findIndex((item) => item.path === path);
  const replacement: QueueItem = {
    id:
      existingIndex >= 0
        ? items[existingIndex].id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    path,
    blob,
    addedAt: new Date().toISOString(),
    status: "pending",
  };

  if (existingIndex >= 0) {
    // Same cloud destination: keep one queue entry and use the newest local
    // content. This prevents duplicate retries/exports from stacking up.
    items[existingIndex] = replacement;
  } else {
    items.push(replacement);
  }
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
        // We intentionally do not persist a destructive "done" state before
        // uploadFile resolves. If the app dies mid-upload, the item remains and
        // can safely retry the same OneDrive path on the next drain.
        await uploadFile(next.path, next.blob);
        items = rest;
        await writeQueue(items);
        uploaded += 1;
      } catch (error) {
        const errored: QueueItem = {
          ...next,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };
        await writeQueue([errored, ...rest]);
        failed += 1;
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
