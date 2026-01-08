/**
 * Sync engine - handles synchronization between IndexedDB and Supabase
 */

import { SupabaseAdapter } from "./supabase-adapter";
import { ChangeTracker } from "./change-tracker";
import { ConflictResolver } from "./conflict-resolver";
import { Database } from "../core/database";
import type { SupabaseConfig, Conflict, ChangeRecord } from "../types";
import { getSyncMetadata, setSyncMetadata } from "../utils/metadata";

export class SyncEngine {
  private adapter: SupabaseAdapter;
  private db: Database;
  private config: SupabaseConfig;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isSyncing: boolean = false;

  constructor(db: Database, config: SupabaseConfig) {
    this.db = db;
    this.config = config;
    this.adapter = new SupabaseAdapter(config);

    // Set up auto-sync if enabled
    if (config.sync?.autoSync) {
      this.startAutoSync();
    }

    // Set up real-time subscriptions if enabled
    if (config.sync?.realtime) {
      this.setupRealtime();
    }
  }

  async push(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      const changeTracker = this.getChangeTracker();
      const pendingChanges = await changeTracker.getPendingChanges();

      console.log(
        `[Localbase] Found ${pendingChanges.length} pending changes to push`
      );

      if (pendingChanges.length === 0) {
        console.log(
          `[Localbase] No pending changes to push. Use pushAll() to sync all existing data.`
        );
        return;
      }

      // Group changes by table
      const changesByTable = new Map<string, ChangeRecord[]>();
      for (const change of pendingChanges) {
        if (!changesByTable.has(change.table)) {
          changesByTable.set(change.table, []);
        }
        changesByTable.get(change.table)!.push(change);
      }

      console.log(
        `[Localbase] Pushing changes to ${changesByTable.size} table(s)`
      );

      // Push changes for each table
      for (const [tableName, changes] of changesByTable) {
        console.log(
          `[Localbase] Pushing ${changes.length} changes for table '${tableName}'`
        );
        await this.pushTableChanges(tableName, changes);
        console.log(
          `[Localbase] Successfully pushed changes for table '${tableName}'`
        );
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async pull(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      const idb = (this.db as any)._db;
      if (!idb) {
        throw new Error("Database not open. Call db.open() first.");
      }

      const changeTracker = this.getChangeTracker();

      // Pull from each configured table
      for (const [localTable, supabaseTable] of Object.entries(
        this.config.tables
      )) {
        try {
          const metadata = await getSyncMetadata(idb, localTable);
          const lastSyncTimestamp = metadata?.lastSyncTimestamp;

          const remoteData = await this.adapter.pull(
            localTable,
            lastSyncTimestamp
          );

          // Apply remote changes to local
          const table = this.db.table(localTable);
          for (const record of remoteData) {
            // Check for conflicts
            const local = await table.get(record.id);
            if (local) {
              const conflict = ConflictResolver.detectConflict(
                local,
                record,
                localTable,
                record.id
              );
              if (conflict) {
                const resolved = await ConflictResolver.resolve(
                  conflict,
                  this.config.sync?.conflictResolution || "last-write-wins"
                );
                await table.put(resolved);
              } else {
                await table.put(record);
              }
            } else {
              await table.put(record);
            }
          }

          // Update sync metadata
          await setSyncMetadata(idb, {
            table: localTable,
            lastSyncTimestamp: Date.now(),
            pendingChanges: await changeTracker
              .getPendingChanges()
              .then(
                (changes) =>
                  changes.filter((c) => c.table === localTable).length
              ),
            syncStatus: "idle",
          });
        } catch (error) {
          // Log error but continue with other tables
          console.error(
            `Failed to sync table '${localTable}' (Supabase: '${supabaseTable}'):`,
            error
          );
          // Update metadata with error status
          try {
            await setSyncMetadata(idb, {
              table: localTable,
              lastSyncTimestamp:
                (await getSyncMetadata(idb, localTable))?.lastSyncTimestamp ||
                0,
              pendingChanges: await changeTracker
                .getPendingChanges()
                .then(
                  (changes) =>
                    changes.filter((c) => c.table === localTable).length
                ),
              syncStatus: "error",
            });
          } catch (metadataError) {
            // Ignore metadata update errors
            console.error("Failed to update sync metadata:", metadataError);
          }
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async full(): Promise<void> {
    // Full bidirectional sync
    await this.pull();
    await this.push();
  }

  /**
   * Push all existing data from local tables to Supabase
   * Useful for initial sync or when change tracking isn't working
   */
  async pushAll(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      // Push all data from each configured table
      for (const [localTable, supabaseTable] of Object.entries(
        this.config.tables
      )) {
        try {
          // Get all records from local table
          const allRecords = await this.db.table(localTable).getAll();

          if (allRecords.length > 0) {
            // Deduplicate records by ID to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time" error
            const recordsMap = new Map<any, any>();
            for (const record of allRecords) {
              if (record.id !== undefined && record.id !== null) {
                recordsMap.set(record.id, record);
              }
            }
            const uniqueRecords = Array.from(recordsMap.values());

            const duplicatesRemoved = allRecords.length - uniqueRecords.length;
            if (duplicatesRemoved > 0) {
              console.warn(
                `[Localbase] Removed ${duplicatesRemoved} duplicate records from '${localTable}'`
              );
            }

            console.log(
              `[Localbase] Pushing ${uniqueRecords.length} unique records from '${localTable}' to Supabase table '${supabaseTable}'`
            );

            // Push all records to Supabase
            await this.adapter.push(localTable, uniqueRecords);

            // Mark all existing changes as synced (if any)
            const changeTracker = this.getChangeTracker();
            const pendingChanges = await changeTracker.getPendingChanges(
              localTable
            );
            if (pendingChanges.length > 0) {
              const changeIds = pendingChanges.map((c) => c.id);
              await changeTracker.markMultipleAsSynced(changeIds);
            }

            console.log(
              `[Localbase] Successfully pushed ${allRecords.length} records to '${supabaseTable}'`
            );
          } else {
            console.log(`[Localbase] No records to push from '${localTable}'`);
          }
        } catch (error) {
          console.error(
            `[Localbase] Failed to push all data for table '${localTable}' (Supabase: '${supabaseTable}'):`,
            error
          );
          throw error;
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  getChangeTracker(): ChangeTracker {
    const idb = (this.db as any)._db;
    if (!idb) {
      throw new Error("Database not open. Call db.open() first.");
    }
    return new ChangeTracker(idb);
  }

  private async pushTableChanges(
    tableName: string,
    changes: ChangeRecord[]
  ): Promise<void> {
    const creates: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];

    for (const change of changes) {
      switch (change.operation) {
        case "create":
          creates.push(change.data);
          break;
        case "update":
          updates.push(change.data);
          break;
        case "delete":
          deletes.push(change.key);
          break;
      }
    }

    try {
      const supabaseTableName = this.adapter.getSupabaseTableName(tableName);

      // Push creates and updates
      if (creates.length > 0 || updates.length > 0) {
        // Combine creates and updates, but deduplicate by ID
        // If a record appears in both, prefer the update (more recent)
        const recordsMap = new Map<any, any>();

        // First add creates
        for (const record of creates) {
          if (record.id !== undefined && record.id !== null) {
            recordsMap.set(record.id, record);
          }
        }

        // Then add/overwrite with updates (updates take precedence)
        for (const record of updates) {
          if (record.id !== undefined && record.id !== null) {
            recordsMap.set(record.id, record);
          }
        }

        const recordsToPush = Array.from(recordsMap.values());

        console.log(
          `[Localbase] Pushing ${recordsToPush.length} unique records (${
            creates.length
          } creates, ${updates.length} updates, ${
            creates.length + updates.length - recordsToPush.length
          } duplicates removed) to Supabase table '${supabaseTableName}'`
        );
        console.log(
          `[Localbase] Sample record:`,
          recordsToPush[0] ? JSON.stringify(recordsToPush[0], null, 2) : "none"
        );
        await this.adapter.push(tableName, recordsToPush);
        console.log(
          `[Localbase] Successfully pushed records to '${supabaseTableName}'`
        );
      }

      // Push deletes
      if (deletes.length > 0) {
        console.log(
          `[Localbase] Deleting ${deletes.length} records from Supabase table '${supabaseTableName}'`
        );
        await this.adapter.delete(tableName, deletes);
        console.log(
          `[Localbase] Successfully deleted records from '${supabaseTableName}'`
        );
      }

      // Mark changes as synced
      const changeTracker = this.getChangeTracker();
      const changeIds = changes.map((c) => c.id);
      await changeTracker.markMultipleAsSynced(changeIds);
      console.log(
        `[Localbase] Marked ${changeIds.length} changes as synced for table '${tableName}'`
      );
    } catch (error) {
      console.error(`[Localbase] Failed to sync table '${tableName}':`, error);
      throw error;
    }
  }

  private startAutoSync(): void {
    const interval = this.config.sync?.syncInterval || 5000;

    this.syncInterval = setInterval(() => {
      if (!this.isSyncing) {
        this.full().catch((error) => {
          console.error("Auto-sync error:", error);
        });
      }
    }, interval);
  }

  private setupRealtime(): void {
    for (const localTable of Object.keys(this.config.tables)) {
      this.adapter.subscribeRealtime(localTable, async (payload) => {
        const table = this.db.table(localTable);

        switch (payload.eventType) {
          case "INSERT":
          case "UPDATE":
            await table.put(payload.new);
            break;
          case "DELETE":
            await table.delete(payload.old.id);
            break;
        }
      });
    }
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.adapter.unsubscribeAll();
  }
}
