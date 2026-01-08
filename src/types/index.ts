import type { SupabaseClient } from "@supabase/supabase-js";

export type IndexSpec =
  | string
  | { name: string; keyPath: string | string[]; unique?: boolean };

export interface TableSchema {
  [tableName: string]: string | IndexSpec[];
}

export type ConflictResolutionStrategy =
  | "last-write-wins"
  | "local-wins"
  | "remote-wins"
  | ((conflict: Conflict) => Promise<any>);

export interface Conflict {
  local: any;
  remote: any;
  table: string;
  key: any;
  localTimestamp: number;
  remoteTimestamp: number;
}

export interface SupabaseConfig {
  client: SupabaseClient<any>;
  tables: Record<string, string>; // Map local table name to Supabase table name
  sync?: {
    strategy?: "push" | "pull" | "bidirectional";
    conflictResolution?: ConflictResolutionStrategy;
    autoSync?: boolean;
    syncInterval?: number;
    realtime?: boolean;
  };
}

export interface DatabaseConfig {
  supabase?: SupabaseConfig;
}

export interface ChangeRecord {
  id: string;
  table: string;
  key: any;
  operation: "create" | "update" | "delete";
  data?: any;
  timestamp: number;
  synced: boolean;
}

export interface SyncMetadata {
  table: string;
  lastSyncTimestamp: number;
  lastRemoteVersion?: string;
  pendingChanges: number;
  syncStatus: "idle" | "syncing" | "error";
}

export type ObservableCallback<T> = (value: T) => void;
export type Unsubscribe = () => void;
