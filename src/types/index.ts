import type { SupabaseClient } from "@supabase/supabase-js";

export type IndexSpec =
  | string
  | { name: string; keyPath: string | string[]; unique?: boolean };

/**
 * Column definition for extended schema format
 */
export interface ColumnDefinition {
  /** PostgreSQL type (e.g., 'text', 'boolean', 'bigint', 'uuid', 'timestamptz') */
  type: string;
  /** Whether this column is the primary key */
  primaryKey?: boolean;
  /** Whether the primary key is auto-generated (IDENTITY) */
  generated?: boolean;
  /** Whether the column can be null (default: true) */
  nullable?: boolean;
  /** Default value for the column */
  default?: string | number | boolean;
  /** Whether the column must be unique */
  unique?: boolean;
  /** Foreign key reference (e.g., 'auth.users(id)') */
  references?: string;
}

/**
 * Extended table schema with Supabase column definitions
 */
export interface ExtendedTableSchema {
  /** Primary key definition (e.g., '++id' for auto-increment) */
  keyPath: string;
  /** Index definitions */
  indexes?: string[];
  /** Column definitions for Supabase - structured format */
  columns?: Record<string, ColumnDefinition | string>;
  /** Column definitions for Supabase - raw SQL format (alias for columns) */
  supabase?: Record<string, string>;
}

/**
 * Table schema can be:
 * - A string like "++id, name, email" (legacy Dexie-like format)
 * - An array of IndexSpec
 * - An ExtendedTableSchema object with Supabase column definitions
 */
export interface TableSchema {
  [tableName: string]: string | IndexSpec[] | ExtendedTableSchema;
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
