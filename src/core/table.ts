/**
 * Table class - main interface for table operations
 */

import { Query } from "./query";
import { Observable } from "../live/observable";
import type { ObservableCallback, Unsubscribe, ChangeRecord } from "../types";
import {
  get,
  getAll,
  put,
  add as idbAdd,
  deleteKey,
  clear,
  count as idbCount,
} from "../utils/idb-wrapper";
import { serializeKey } from "../utils/serialization";

export class Table<T = any> {
  private db: IDBDatabase;
  private storeName: string;
  private keyPath: string | string[] | null;
  private changeTracker?: (
    change: Omit<ChangeRecord, "id" | "synced" | "timestamp">
  ) => void;

  constructor(
    db: IDBDatabase,
    storeName: string,
    keyPath: string | string[] | null = null,
    changeTracker?: (
      change: Omit<ChangeRecord, "id" | "synced" | "timestamp">
    ) => void
  ) {
    this.db = db;
    this.storeName = storeName;
    this.keyPath = keyPath;
    this.changeTracker = changeTracker;
  }

  async get(key: any): Promise<T | undefined> {
    const transaction = this.db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);
    const serializedKey = serializeKey(key);
    return get<T>(store, serializedKey);
  }

  async getAll(keys?: any[]): Promise<T[]> {
    const transaction = this.db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);

    if (keys) {
      const results = await Promise.all(
        keys.map((key) => {
          const serializedKey = serializeKey(key);
          return get<T>(store, serializedKey);
        })
      );
      return results.filter((item) => item !== undefined) as T[];
    }

    return getAll<T>(store);
  }

  async add(item: T, key?: any): Promise<any> {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    const result =
      key !== undefined
        ? await idbAdd(store, item, serializeKey(key))
        : await idbAdd(store, item);

    // Track change - use the returned key if available, otherwise try to get from item
    if (this.changeTracker) {
      let itemKey: any;

      // If we have a keyPath and auto-increment, the result IS the key
      if (this.keyPath !== null && key === undefined) {
        itemKey = result;
      } else if (key !== undefined) {
        itemKey = key;
      } else {
        itemKey = this.getKeyFromItem(item);
      }

      // Create a complete item with the key for change tracking
      const itemWithKey =
        this.keyPath !== null && typeof this.keyPath === "string"
          ? { ...item, [this.keyPath]: itemKey }
          : item;

      this.changeTracker({
        table: this.storeName,
        key: itemKey,
        operation: "create",
        data: itemWithKey,
      });
    }

    return result;
  }

  async put(item: T, key?: any): Promise<any> {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);

    // If the store uses in-line keys (keyPath), NEVER pass key parameter
    // The key must be in the item itself, and IndexedDB will extract it
    // Passing a key parameter when keyPath exists will cause an error
    let result: any;
    const hasKeyPath = this.keyPath !== null && this.keyPath !== undefined;

    if (hasKeyPath) {
      // Store uses in-line keys - key must be in the item, NEVER pass key parameter
      // Even if key is provided, we ignore it because IndexedDB will extract from item
      // IndexedDB will throw "key parameter was provided" error if we pass it
      result = await put(store, item);
    } else {
      // Store doesn't use in-line keys - key can be passed separately
      result =
        key !== undefined && key !== null
          ? await put(store, item, serializeKey(key))
          : await put(store, item);
    }

    // Track change
    if (this.changeTracker) {
      const itemKey = this.getKeyFromItem(item);
      this.changeTracker({
        table: this.storeName,
        key: itemKey,
        operation: "update",
        data: item,
      });
    }

    return result;
  }

  async update(key: any, changes: Partial<T>): Promise<any> {
    const existing = await this.get(key);
    if (!existing) {
      throw new Error(`Item with key ${key} not found`);
    }

    const updated = { ...existing, ...changes };

    // If store uses in-line keys, ensure the key is in the updated object
    if (this.keyPath !== null) {
      // Key is already in the existing object, so it will be in updated
      return this.put(updated);
    } else {
      // Store doesn't use in-line keys, pass key separately
      return this.put(updated, key);
    }
  }

  async delete(key: any): Promise<void> {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    const serializedKey = serializeKey(key);

    await deleteKey(store, serializedKey);

    // Track change
    if (this.changeTracker) {
      this.changeTracker({
        table: this.storeName,
        key: key,
        operation: "delete",
      });
    }
  }

  async clear(): Promise<void> {
    const transaction = this.db.transaction([this.storeName], "readwrite");
    const store = transaction.objectStore(this.storeName);
    await clear(store);
  }

  async count(): Promise<number> {
    const transaction = this.db.transaction([this.storeName], "readonly");
    const store = transaction.objectStore(this.storeName);
    return idbCount(store);
  }

  query(): Query<T> {
    return new Query<T>(this.db, this.storeName);
  }

  live(): LiveQuery<T> {
    return new LiveQuery<T>(this);
  }

  bulkAdd(items: T[]): Promise<any[]> {
    return Promise.all(items.map((item) => this.add(item)));
  }

  bulkPut(items: T[]): Promise<any[]> {
    return Promise.all(items.map((item) => this.put(item)));
  }

  bulkDelete(keys: any[]): Promise<void[]> {
    return Promise.all(keys.map((key) => this.delete(key)));
  }

  private getKeyFromItem(item: T): any {
    if (this.keyPath === null) {
      return undefined;
    }

    if (typeof this.keyPath === "string") {
      return (item as any)[this.keyPath];
    }

    // Composite key
    return this.keyPath.map((path) => (item as any)[path]);
  }
}

/**
 * Live query implementation
 */
class LiveQuery<T> {
  private observable: Observable<T[]>;
  private table: Table<T>;
  private query: Query<T>;
  private unsubscribe: (() => void) | null = null;

  constructor(table: Table<T>) {
    this.table = table;
    this.query = table.query();
    this.observable = new Observable<T[]>([]);

    // Initial load
    this.refresh();
  }

  where(field: string): any {
    const builder = this.query.where(field);
    return {
      equals: (value: any) => {
        this.query = builder.equals(value);
        return this;
      },
      above: (value: any) => {
        this.query = builder.above(value);
        return this;
      },
      aboveOrEqual: (value: any) => {
        this.query = builder.aboveOrEqual(value);
        return this;
      },
      below: (value: any) => {
        this.query = builder.below(value);
        return this;
      },
      belowOrEqual: (value: any) => {
        this.query = builder.belowOrEqual(value);
        return this;
      },
      between: (lower: any, upper: any) => {
        this.query = builder.between(lower, upper);
        return this;
      },
      startsWith: (value: string) => {
        this.query = builder.startsWith(value);
        return this;
      },
      matches: (regex: string | RegExp) => {
        this.query = builder.matches(regex);
        return this;
      },
      notEqual: (value: any) => {
        this.query = builder.notEqual(value);
        return this;
      },
    };
  }

  filter(predicate: (item: T) => boolean): LiveQuery<T> {
    this.query = this.query.filter(predicate);
    return this;
  }

  sort(field: string, direction: "asc" | "desc" = "asc"): LiveQuery<T> {
    this.query = this.query.sort(field, direction);
    return this;
  }

  limit(count: number): LiveQuery<T> {
    this.query = this.query.limit(count);
    return this;
  }

  offset(count: number): LiveQuery<T> {
    this.query = this.query.offset(count);
    return this;
  }

  subscribe(callback: ObservableCallback<T[]>): Unsubscribe {
    const unsubscribe = this.observable.subscribe(callback);

    // Set up change detection (simplified - in production, use MutationObserver or similar)
    if (!this.unsubscribe) {
      this.setupChangeDetection();
    }

    return () => {
      unsubscribe();
      if (this.observable.subscriberCount === 0 && this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }

  private async refresh(): Promise<void> {
    const results = await this.query.toArray();
    this.observable.next(results);
  }

  private setupChangeDetection(): void {
    // Simple polling-based change detection
    // In a production system, you'd want to use IndexedDB change events or MutationObserver
    const interval = setInterval(() => {
      this.refresh().catch((error) => {
        console.error("Error refreshing live query:", error);
      });
    }, 100); // Poll every 100ms

    this.unsubscribe = () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }

  // Cleanup method to ensure intervals are cleared
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.observable.unsubscribeAll();
  }
}
