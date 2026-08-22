// Minimal IndexedDB wrapper — no external dependency.
const DB_NAME = "cri-blo-assistant";
const DB_VERSION = 7;
export const STORE_CRIS = "cris";
export const STORE_PROFILE = "profile";
export const STORE_PHOTOS = "photos";
export const STORE_SETTINGS = "settings";
export const STORE_ATTACHMENTS = "attachments";
export const STORE_GEOCACHE = "geocache";
export const STORE_AI_PATTERNS = "aiPatterns";
/** Documents d'autres types (D15, inconnus…) — historique séparé du CRI BLO. */
export const STORE_OTHER_DOCS = "otherDocs";
/** Conversations de l'Assistant IA — module indépendant du CRI BLO. */
export const STORE_AI_CHATS = "aiChats";
/** Fichiers téléchargés depuis le navigateur intégré. */
export const STORE_DOWNLOADS = "downloads";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CRIS)) {
        const store = db.createObjectStore(STORE_CRIS, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("addressStatus", "addressStatus");
      }
      if (!db.objectStoreNames.contains(STORE_PROFILE)) {
        db.createObjectStore(STORE_PROFILE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        const s = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "id" });
        s.createIndex("criId", "criId");
      }
      if (!db.objectStoreNames.contains(STORE_GEOCACHE)) {
        const s = db.createObjectStore(STORE_GEOCACHE, { keyPath: "key" });
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_AI_PATTERNS)) {
        const s = db.createObjectStore(STORE_AI_PATTERNS, { keyPath: "id" });
        s.createIndex("usedAt", "usedAt");
      }
      if (!db.objectStoreNames.contains(STORE_OTHER_DOCS)) {
        const s = db.createObjectStore(STORE_OTHER_DOCS, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
        s.createIndex("docType", "docType");
      }
      if (!db.objectStoreNames.contains(STORE_AI_CHATS)) {
        const s = db.createObjectStore(STORE_AI_CHATS, { keyPath: "id" });
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_DOWNLOADS)) {
        const s = db.createObjectStore(STORE_DOWNLOADS, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Une connexion fermée (autre onglet, mise à niveau, mise en veille mobile)
      // ne doit jamais rester en cache : sinon toute transaction échoue avec
      // « The database connection is closing ».
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("Base de données occupée par un autre onglet."));
    };
  });
  return dbPromise;
}

function isClosingError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /closing|InvalidStateError|NotFoundError|TransactionInactive/i.test(msg);
}

async function runTx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(store, mode);
    } catch (e) {
      dbPromise = null;
      reject(e);
      return;
    }
    const objectStore = transaction.objectStore(store);
    let result: T;
    Promise.resolve(fn(objectStore))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  try {
    return await runTx(store, mode, fn);
  } catch (e) {
    if (!isClosingError(e)) throw e;
    // Une seule nouvelle tentative avec une connexion fraîche.
    dbPromise = null;
    return runTx(store, mode, fn);
  }
}

export function reqAsync<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}


export async function exportSyncSnapshot(): Promise<Blob> {
  const stores = [
    STORE_CRIS, STORE_PROFILE, STORE_PHOTOS, STORE_SETTINGS,
    STORE_ATTACHMENTS, STORE_GEOCACHE, STORE_AI_PATTERNS,
    STORE_OTHER_DOCS, STORE_AI_CHATS, STORE_DOWNLOADS,
  ];
  await openDb();
  const payload: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const storeName of stores) {
    const records = await tx(storeName, "readonly", (s) => reqAsync(s.getAll()));
    const encoded = [];
    for (const record of records as unknown[]) {
      encoded.push(await encodeSyncValue(record));
    }
    (payload.stores as Record<string, unknown>)[storeName] = encoded;
  }
  return new Blob([JSON.stringify(payload)], { type: "application/json" });
}

async function encodeSyncValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { __blob: true, type: value.type, data: btoa(binary) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeSyncValue));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "handle") continue; // File System Access handles cannot be serialized.
      out[k] = await encodeSyncValue(v);
    }
    return out;
  }
  return value;
}

async function decodeSyncValue(value: unknown): Promise<unknown> {
  if (value && typeof value === "object" && (value as { __blob?: boolean }).__blob) {
    const v = value as { type?: string; data: string };
    const binary = atob(v.data);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: v.type || "application/octet-stream" });
  }
  if (Array.isArray(value)) return Promise.all(value.map(decodeSyncValue));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await decodeSyncValue(v);
    return out;
  }
  return value;
}

export async function importSyncSnapshot(blob: Blob): Promise<void> {
  const payload = JSON.parse(await blob.text()) as { version: number; stores: Record<string, unknown[]> };
  if (payload.version !== 1 || !payload.stores) throw new Error("Sauvegarde Criblo incompatible.");
  for (const [storeName, values] of Object.entries(payload.stores)) {
    if (![
      STORE_CRIS, STORE_PROFILE, STORE_PHOTOS, STORE_SETTINGS,
      STORE_ATTACHMENTS, STORE_GEOCACHE, STORE_AI_PATTERNS,
      STORE_OTHER_DOCS, STORE_AI_CHATS, STORE_DOWNLOADS,
    ].includes(storeName)) continue;
    const decoded = await Promise.all(values.map(decodeSyncValue));
    await tx(storeName, "readwrite", (s) => {
      for (const item of decoded) s.put(item);
    });
  }
}
