/**
 * Main Database class - similar to Dexie
 */

import { Table } from "./table";
import {
  openDatabase,
  createObjectStore,
  createIndex,
} from "../utils/idb-wrapper";
// Metadata stores are initialized during schema setup
import type {
  TableSchema,
  DatabaseConfig,
  ChangeRecord,
  SupabaseConfig,
} from "../types";

export class Database {
  private db: IDBDatabase | null = null;
  private tables: Map<string, Table> = new Map();
  private schema: TableSchema;
  private config: DatabaseConfig;
  private changeQueue: ChangeRecord[] = [];
  private version: number = 1;

  constructor(
    public name: string,
    schema: TableSchema,
    config: DatabaseConfig = {}
  ) {
    this.schema = schema;
    this.config = config;
  }

  private openingPromise: Promise<this> | null = null;

  async open(): Promise<this> {
    // If already open, return immediately
    if (this.db) {
      return this;
    }

    // If already opening, wait for that promise
    if (this.openingPromise) {
      return this.openingPromise;
    }

    // Parse schema to determine version
    this.version = this.calculateVersion();

    // Create opening promise to prevent race conditions
    this.openingPromise = (async () => {
      try {
        // Try to open with calculated version
        try {
          this.db = await openDatabase(
            this.name,
            this.version,
            (db, oldVersion, newVersion) => {
              this.setupSchema(db, oldVersion, newVersion);
              // Initialize metadata stores during upgrade transaction
              this.initMetadataStores(db);
            }
          );
        } catch (error: any) {
          // Handle VersionError - database exists with higher version
          if (
            error?.name === "VersionError" ||
            error?.message?.includes("version")
          ) {
            // Try to determine existing version by attempting to open without upgrade
            // We'll try progressively higher versions
            let foundVersion = false;
            for (let v = this.version + 1; v <= this.version + 10; v++) {
              try {
                this.db = await openDatabase(
                  this.name,
                  v,
                  (db, oldVersion, newVersion) => {
                    // Only setup if this is actually an upgrade
                    if (oldVersion < v) {
                      this.setupSchema(db, oldVersion, newVersion);
                      this.initMetadataStores(db);
                    }
                  }
                );
                this.version = v;
                foundVersion = true;
                break;
              } catch (e: any) {
                // If it's not a version error, it might be something else
                if (
                  e?.name !== "VersionError" &&
                  !e?.message?.includes("version")
                ) {
                  throw e;
                }
                // Continue trying higher versions
              }
            }

            if (!foundVersion) {
              // Last resort: try to open with a very high version
              this.version = 999;
              this.db = await openDatabase(
                this.name,
                this.version,
                (db, oldVersion, newVersion) => {
                  this.setupSchema(db, oldVersion, newVersion);
                  this.initMetadataStores(db);
                }
              );
            }

            // Ensure db is set
            if (!this.db) {
              throw new Error(
                "Failed to open database: could not determine version"
              );
            }
          } else {
            throw error;
          }
        }

        // Ensure db is set before checking stores
        if (!this.db) {
          throw new Error("Database not opened");
        }

        // Check if metadata stores exist, if not, trigger upgrade
        if (
          !this.db.objectStoreNames.contains("_metadata") ||
          !this.db.objectStoreNames.contains("_changes")
        ) {
          // Close and reopen with incremented version to trigger upgrade
          this.db.close();
          this.version = this.version + 1;

          this.db = await openDatabase(
            this.name,
            this.version,
            (db, oldVersion, newVersion) => {
              this.setupSchema(db, oldVersion, newVersion);
              this.initMetadataStores(db);
            }
          );
        }

        // Create table instances
        this.createTables();

        return this;
      } finally {
        // Clear opening promise after completion
        this.openingPromise = null;
      }
    })();

    return this.openingPromise;
  }

  async close(): Promise<void> {
    // Wait for any pending open operation
    if (this.openingPromise) {
      await this.openingPromise;
    }

    if (this.db) {
      // Stop sync engine if it exists
      if ((this as any)._syncEngine) {
        (this as any)._syncEngine.stop();
        (this as any)._syncEngine = null;
      }

      // Close all live queries
      for (const table of this.tables.values()) {
        // Clean up any live queries (they should clean themselves up on unsubscribe)
        // But we can't access them directly, so we rely on proper cleanup
      }

      this.db.close();
      this.db = null;
      this.tables.clear();
      this.openingPromise = null;
    }
  }

  async delete(): Promise<void> {
    await this.close();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  transaction<T>(
    tables: string | string[],
    mode: IDBTransactionMode,
    callback: (tables: { [tableName: string]: Table }) => Promise<T> | T
  ): Promise<T> {
    if (!this.db) {
      throw new Error("Database not open. Call open() first.");
    }

    const tableNames = Array.isArray(tables) ? tables : [tables];
    const transaction = this.db.transaction(tableNames, mode);

    const tableInstances: { [tableName: string]: Table } = {};
    for (const tableName of tableNames) {
      const table = this.tables.get(tableName);
      if (!table) {
        throw new Error(`Table ${tableName} not found`);
      }
      tableInstances[tableName] = table;
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = async () => {
        try {
          const result = await callback(tableInstances);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      transaction.onerror = () => reject(transaction.error);

      // Execute callback
      Promise.resolve(callback(tableInstances)).catch(reject);
    });
  }

  table<T = any>(name: string): Table<T> {
    const table = this.tables.get(name);
    if (!table) {
      throw new Error(
        `Table ${name} not found. Make sure the database is open.`
      );
    }
    return table as Table<T>;
  }

  get sync() {
    if (!this.config.supabase) {
      throw new Error(
        "Supabase not configured. Provide supabase config in Database constructor."
      );
    }
    if (!this.db) {
      throw new Error("Database not open. Call open() first.");
    }
    // Lazy load sync engine
    if (!(this as any)._syncEngine) {
      // Dynamic require to avoid circular dependencies at module load time
      // @ts-ignore - require is available at runtime in bundled environments
      const syncModule = require("../sync/sync-engine") as {
        SyncEngine: new (db: Database, config: SupabaseConfig) => any;
      };
      (this as any)._syncEngine = new syncModule.SyncEngine(
        this,
        this.config.supabase
      );
    }
    return (this as any)._syncEngine;
  }

  private calculateVersion(): number {
    // Simple version calculation - in production, you'd want more sophisticated versioning
    return 1;
  }

  private setupSchema(
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ): void {
    // Create user-defined tables
    for (const [tableName, schema] of Object.entries(this.schema)) {
      if (!db.objectStoreNames.contains(tableName)) {
        const { keyPath, autoIncrement, indexes } = this.parseSchema(schema);
        const store = createObjectStore(db, tableName, keyPath, autoIncrement);

        // Create indexes
        if (indexes) {
          for (const index of indexes) {
            if (typeof index === "string") {
              createIndex(store, index, index);
            } else {
              const keyPath = Array.isArray(index.keyPath)
                ? index.keyPath
                : [index.keyPath];
              createIndex(store, index.name, keyPath, index.unique || false);
            }
          }
        }
      }
    }
  }

  private initMetadataStores(db: IDBDatabase): void {
    const METADATA_STORE = "_metadata";
    const CHANGES_STORE = "_changes";

    // Create metadata store if it doesn't exist
    if (!db.objectStoreNames.contains(METADATA_STORE)) {
      db.createObjectStore(METADATA_STORE, { keyPath: "table" });
    }

    // Create changes store if it doesn't exist
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

  private parseSchema(schema: string | any[]): {
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    indexes?: any[];
  } {
    if (typeof schema === "string") {
      // Parse Dexie-style schema string like "++id, name, email, *tags"
      const parts = schema.split(",").map((s) => s.trim());
      let keyPath: string | null = null;
      let autoIncrement = false;
      const indexes: any[] = [];

      for (const part of parts) {
        if (part.startsWith("++")) {
          // Auto-increment primary key
          keyPath = part.substring(2);
          autoIncrement = true;
        } else if (part.startsWith("&")) {
          // Unique index
          const indexName = part.substring(1);
          indexes.push({ name: indexName, keyPath: indexName, unique: true });
        } else if (part.startsWith("*")) {
          // Multi-entry index
          const indexName = part.substring(1);
          indexes.push({ name: indexName, keyPath: indexName, unique: false });
        } else if (part && !keyPath) {
          // First non-special field becomes keyPath if no ++id
          keyPath = part;
        } else if (part) {
          // Regular index
          indexes.push({ name: part, keyPath: part, unique: false });
        }
      }

      return { keyPath, autoIncrement, indexes };
    } else if (Array.isArray(schema)) {
      // Array of index specs
      return { keyPath: null, autoIncrement: false, indexes: schema };
    }

    return { keyPath: null, autoIncrement: false };
  }

  private createTables(): void {
    if (!this.db) return;

    for (const [tableName, schema] of Object.entries(this.schema)) {
      const { keyPath } = this.parseSchema(schema);
      const table = new Table(this.db, tableName, keyPath, (change) =>
        this.trackChange(tableName, change)
      );
      this.tables.set(tableName, table);
    }
  }

  private trackChange(
    tableName: string,
    change: Omit<ChangeRecord, "id" | "synced" | "timestamp">
  ): void {
    const changeRecord: ChangeRecord = {
      id: `${Date.now()}-${Math.random()}`,
      ...change,
      table: tableName,
      timestamp: Date.now(),
      synced: false,
    };
    this.changeQueue.push(changeRecord);

    // Store in changes table if db is available
    if (this.db) {
      const transaction = this.db.transaction(["_changes"], "readwrite");
      const store = transaction.objectStore("_changes");
      store.add(changeRecord);
    }
  }

  get _db(): IDBDatabase | null {
    return this.db;
  }
}
