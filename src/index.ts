export { Database } from "./core/database";
export { Table } from "./core/table";
export { Query } from "./core/query";
export { Observable } from "./live/observable";
export { SyncEngine } from "./sync/sync-engine";
export { SupabaseAdapter } from "./sync/supabase-adapter";

export type {
  TableSchema,
  DatabaseConfig,
  SupabaseConfig,
  Conflict,
  ConflictResolutionStrategy,
  ChangeRecord,
  SyncMetadata,
  ObservableCallback,
  Unsubscribe,
  IndexSpec,
} from "./types";

import { Database } from "./core/database";
export default Database;
