import type { SyncMetadata } from "../types";
import { openDatabase, get, put } from "./idb-wrapper";

const METADATA_STORE = "_metadata";
const CHANGES_STORE = "_changes";

export async function initMetadataStores(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    db.createObjectStore(METADATA_STORE, { keyPath: "table" });
  }
  if (!db.objectStoreNames.contains(CHANGES_STORE)) {
    const changesStore = db.createObjectStore(CHANGES_STORE, {
      keyPath: "id",
      autoIncrement: true,
    });
    changesStore.createIndex("table", "table", { unique: false });
    changesStore.createIndex("synced", "synced", { unique: false });
    changesStore.createIndex("timestamp", "timestamp", { unique: false });
  }
}

export async function getSyncMetadata(
  db: IDBDatabase,
  table: string
): Promise<SyncMetadata | null> {
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    return null;
  }

  const transaction = db.transaction([METADATA_STORE], "readonly");
  const store = transaction.objectStore(METADATA_STORE);
  const result = await get<SyncMetadata>(store, table);
  return result ?? null;
}

export async function setSyncMetadata(
  db: IDBDatabase,
  metadata: SyncMetadata
): Promise<void> {
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    throw new Error(
      "Metadata store '_metadata' not found. " +
        "The database may need to be upgraded."
    );
  }

  const transaction = db.transaction([METADATA_STORE], "readwrite");
  const store = transaction.objectStore(METADATA_STORE);
  await put(store, metadata);
}

export async function getPendingChangesCount(
  db: IDBDatabase,
  table?: string
): Promise<number> {
  if (!db.objectStoreNames.contains(CHANGES_STORE)) {
    return 0;
  }

  const transaction = db.transaction([CHANGES_STORE], "readonly");
  const store = transaction.objectStore(CHANGES_STORE);
  const index = store.index("synced");

  if (table) {
    const tableIndex = store.index("table");
    const allChanges = await new Promise<any[]>((resolve, reject) => {
      const request = tableIndex.getAll(table);
      request.onsuccess = () =>
        resolve(request.result.filter((c) => !c.synced));
      request.onerror = () => reject(request.error);
    });
    return allChanges.length;
  }

  const unsynced = await new Promise<any[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result;
      resolve(all.filter((c: any) => c.synced === false));
    };
    request.onerror = () => reject(request.error);
  });

  return unsynced.length;
}
