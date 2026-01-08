import { Table } from "./table";
import {
  openDatabase,
  createObjectStore,
  createIndex,
} from "../utils/idb-wrapper";
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
    if (this.db) {
      return this;
    }

    if (this.openingPromise) {
      return this.openingPromise;
    }

    this.version = this.calculateVersion();

    this.openingPromise = (async () => {
      try {
        try {
          this.db = await openDatabase(
            this.name,
            this.version,
            (db, oldVersion, newVersion) => {
              this.setupSchema(db, oldVersion, newVersion);
              this.initMetadataStores(db);
            }
          );
        } catch (error: any) {
          if (
            error?.name === "VersionError" ||
            error?.message?.includes("version")
          ) {
            let foundVersion = false;
            for (let v = this.version + 1; v <= this.version + 10; v++) {
              try {
                this.db = await openDatabase(
                  this.name,
                  v,
                  (db, oldVersion, newVersion) => {
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
                if (
                  e?.name !== "VersionError" &&
                  !e?.message?.includes("version")
                ) {
                  throw e;
                }
              }
            }

            if (!foundVersion) {
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

            if (!this.db) {
              throw new Error(
                "Failed to open database: could not determine version"
              );
            }
          } else {
            throw error;
          }
        }

        if (!this.db) {
          throw new Error("Database not opened");
        }

        if (
          !this.db.objectStoreNames.contains("_metadata") ||
          !this.db.objectStoreNames.contains("_changes")
        ) {
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

        this.createTables();

        return this;
      } finally {
        this.openingPromise = null;
      }
    })();

    return this.openingPromise;
  }

  async close(): Promise<void> {
    if (this.openingPromise) {
      await this.openingPromise;
    }

    if (this.db) {
      if ((this as any)._syncEngine) {
        (this as any)._syncEngine.stop();
        (this as any)._syncEngine = null;
      }

      for (const table of this.tables.values()) {
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
    if (!(this as any)._syncEngine) {
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
    return 1;
  }

  private setupSchema(
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ): void {
    for (const [tableName, schema] of Object.entries(this.schema)) {
      if (!db.objectStoreNames.contains(tableName)) {
        const { keyPath, autoIncrement, indexes } = this.parseSchema(schema);
        const store = createObjectStore(db, tableName, keyPath, autoIncrement);

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

  private parseSchema(
    schema: string | any[] | { keyPath?: string; indexes?: string[] }
  ): {
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    indexes?: any[];
  } {
    if (
      typeof schema === "object" &&
      !Array.isArray(schema) &&
      "keyPath" in schema
    ) {
      const extendedSchema = schema as { keyPath: string; indexes?: string[] };
      const keyPathStr = extendedSchema.keyPath;
      let keyPath: string | null = null;
      let autoIncrement = false;

      if (keyPathStr.startsWith("++")) {
        keyPath = keyPathStr.substring(2);
        autoIncrement = true;
      } else if (keyPathStr.startsWith("&")) {
        keyPath = keyPathStr.substring(1);
      } else {
        keyPath = keyPathStr;
      }

      const indexes = extendedSchema.indexes?.map((idx) => ({
        name: idx,
        keyPath: idx,
        unique: false,
      }));

      return { keyPath, autoIncrement, indexes };
    }

    if (typeof schema === "string") {
      const parts = schema.split(",").map((s) => s.trim());
      let keyPath: string | null = null;
      let autoIncrement = false;
      const indexes: any[] = [];

      for (const part of parts) {
        if (part.startsWith("++")) {
          keyPath = part.substring(2);
          autoIncrement = true;
        } else if (part.startsWith("&")) {
          const indexName = part.substring(1);
          indexes.push({ name: indexName, keyPath: indexName, unique: true });
        } else if (part.startsWith("*")) {
          const indexName = part.substring(1);
          indexes.push({ name: indexName, keyPath: indexName, unique: false });
        } else if (part && !keyPath) {
          keyPath = part;
        } else if (part) {
          indexes.push({ name: part, keyPath: part, unique: false });
        }
      }

      return { keyPath, autoIncrement, indexes };
    }

    if (Array.isArray(schema)) {
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
