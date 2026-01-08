import type { ChangeRecord } from "../types";
import { get, getAll, put, deleteKey } from "../utils/idb-wrapper";

export class ChangeTracker {
  private db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async getPendingChanges(table?: string): Promise<ChangeRecord[]> {
    if (!this.db.objectStoreNames.contains("_changes")) {
      throw new Error(
        "Metadata store '_changes' not found. " +
          "The database may need to be upgraded. " +
          "Try deleting and recreating the database, or increment the version number."
      );
    }

    const transaction = this.db.transaction(["_changes"], "readonly");
    const store = transaction.objectStore("_changes");

    const unsynced = await new Promise<ChangeRecord[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let changes = request.result.filter((c: ChangeRecord) => !c.synced);
        if (table) {
          changes = changes.filter((c) => c.table === table);
        }
        resolve(changes);
      };
      request.onerror = () => reject(request.error);
    });

    return unsynced;
  }

  async markAsSynced(changeId: string): Promise<void> {
    if (!this.db.objectStoreNames.contains("_changes")) {
      throw new Error(
        "Metadata store '_changes' not found. " +
          "The database may need to be upgraded."
      );
    }

    const transaction = this.db.transaction(["_changes"], "readwrite");
    const store = transaction.objectStore("_changes");

    const change = await get<ChangeRecord>(store, changeId);
    if (change) {
      change.synced = true;
      await put(store, change);
    }
  }

  async markMultipleAsSynced(changeIds: string[]): Promise<void> {
    if (!this.db.objectStoreNames.contains("_changes")) {
      throw new Error(
        "Metadata store '_changes' not found. " +
          "The database may need to be upgraded."
      );
    }

    const transaction = this.db.transaction(["_changes"], "readwrite");
    const store = transaction.objectStore("_changes");

    await Promise.all(
      changeIds.map(async (id) => {
        const change = await get<ChangeRecord>(store, id);
        if (change) {
          change.synced = true;
          await put(store, change);
        }
      })
    );
  }

  async clearSyncedChanges(): Promise<void> {
    if (!this.db.objectStoreNames.contains("_changes")) {
      return;
    }

    const transaction = this.db.transaction(["_changes"], "readwrite");
    const store = transaction.objectStore("_changes");

    const synced = await new Promise<ChangeRecord[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result.filter((c: ChangeRecord) => c.synced === true));
      };
      request.onerror = () => reject(request.error);
    });

    await Promise.all(synced.map((change) => deleteKey(store, change.id)));
  }

  async getChangesByTable(table: string): Promise<ChangeRecord[]> {
    if (!this.db.objectStoreNames.contains("_changes")) {
      return [];
    }

    const transaction = this.db.transaction(["_changes"], "readonly");
    const store = transaction.objectStore("_changes");
    const index = store.index("table");

    return new Promise((resolve, reject) => {
      const request = index.getAll(table);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
