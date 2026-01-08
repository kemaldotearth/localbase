# Localbase Architecture

## Overview

Localbase is a Dexie-like IndexedDB wrapper with optional Supabase synchronization. It provides a local-first database solution that can work offline and sync with Supabase when configured.

## Project Structure

```
src/
├── core/           # Core database functionality
│   ├── database.ts # Main Database class
│   ├── table.ts    # Table operations and live queries
│   └── query.ts    # Query builder
├── live/           # Live query system
│   └── observable.ts # Observable pattern implementation
├── sync/           # Supabase sync functionality
│   ├── supabase-adapter.ts  # Supabase client wrapper
│   ├── sync-engine.ts       # Core sync logic
│   ├── change-tracker.ts    # Track local changes
│   └── conflict-resolver.ts # Conflict resolution
├── utils/          # Utility functions
│   ├── idb-wrapper.ts    # Low-level IndexedDB helpers
│   ├── metadata.ts       # Sync metadata management
│   └── serialization.ts   # Key serialization
└── types/           # TypeScript definitions
```

## Core Components

### Database Class

The main entry point, similar to Dexie:

- Manages database lifecycle (open, close, delete)
- Handles schema definition and migrations
- Creates and manages table instances
- Provides transaction support
- Lazy-loads sync engine when Supabase is configured

### Table Class

Provides CRUD operations and queries:

- `add()`, `get()`, `put()`, `update()`, `delete()`, `clear()`
- `query()` - Returns a Query builder
- `live()` - Returns a LiveQuery for reactive updates
- Bulk operations: `bulkAdd()`, `bulkPut()`, `bulkDelete()`
- Automatic change tracking for sync

### Query Builder

Fluent API for querying:

- `where(field)` - Chainable where clauses
- `filter()` - JavaScript predicate filtering
- `sort()`, `limit()`, `offset()` - Result manipulation
- `toArray()`, `first()`, `count()` - Execution methods

### Live Queries

Reactive queries that automatically update:

- Uses Observable pattern
- Currently uses polling (100ms interval)
- Future: Could use IndexedDB change events or MutationObserver
- Subscriptions can be unsubscribed

### Sync Engine

Handles bidirectional sync with Supabase:

- **Push**: Sends local changes to Supabase
- **Pull**: Fetches remote changes from Supabase
- **Full**: Bidirectional sync
- **Auto-sync**: Periodic automatic syncing
- **Real-time**: Supabase real-time subscriptions

### Change Tracker

Tracks all local mutations:

- Stores changes in `_changes` table
- Tracks operation type (create, update, delete)
- Marks changes as synced after successful sync
- Can query pending changes by table

### Conflict Resolver

Handles conflicts during sync:

- **last-write-wins**: Timestamp-based resolution
- **local-wins**: Always prefer local
- **remote-wins**: Always prefer remote
- **Custom function**: User-defined resolution

## Data Flow

### Local Operations

1. User calls `table.add()` or `table.update()`
2. Table performs IndexedDB operation
3. Change tracker records the mutation
4. Change stored in `_changes` table
5. Live queries are notified (if subscribed)

### Sync Operations

1. **Push**:

   - Change tracker gets pending changes
   - Groups by table
   - Supabase adapter pushes to Supabase
   - Changes marked as synced

2. **Pull**:

   - Supabase adapter fetches remote data
   - Conflict resolver checks for conflicts
   - Resolved data written to IndexedDB
   - Sync metadata updated

3. **Real-time**:
   - Supabase real-time subscription
   - Events mapped to local operations
   - Live queries notified

## Current Limitations & Future Improvements

### Live Queries

- Currently uses polling (100ms)
- **Future**: Use IndexedDB change events or MutationObserver
- **Future**: More efficient change detection

### Conflict Resolution

- Basic timestamp-based detection
- **Future**: Operational transforms
- **Future**: Vector clocks for better conflict detection

### Schema Migrations

- Basic versioning
- **NEW**: Extended schema format with Supabase column definitions
- **NEW**: `generateSupabaseMigration()` utility for SQL generation
- **NEW**: `generateTypeScriptInterface()` for type generation
- **NEW**: `validateSchemaForSync()` for schema validation

### Performance

- Basic batching
- **Future**: Optimized bulk operations
- **Future**: Index optimization
- **Future**: Query result caching

### Error Handling

- Basic error handling
- **Future**: Retry logic
- **Future**: Offline queue management
- **Future**: Conflict resolution UI helpers

## Testing Considerations

Areas that need testing:

1. IndexedDB operations (CRUD)
2. Query builder (all operators)
3. Live queries (subscriptions)
4. Sync engine (push/pull/full)
5. Conflict resolution (all strategies)
6. Change tracking
7. Real-time subscriptions
8. Error handling
9. Offline scenarios

## Usage Patterns

### Offline-First

```typescript
// Works completely offline
const db = new Database("App", schema);
await db.open();
// All operations work offline
```

### With Sync

```typescript
// Add Supabase for sync
const db = new Database("App", schema, { supabase: config });
await db.open();
// Automatic sync when online
```

### Manual Sync

```typescript
// Control sync manually
await db.sync.push();
await db.sync.pull();
```

### Extended Schema with Supabase

```typescript
import {
  Database,
  generateSupabaseMigration,
  type ExtendedTableSchema,
} from "localbase";

// Define schema with full Supabase column definitions
const schema: Record<string, ExtendedTableSchema> = {
  todos: {
    keyPath: "++id",
    indexes: ["completed", "createdAt"],
    columns: {
      id: { type: "bigint", primaryKey: true, generated: true },
      title: { type: "text", nullable: false },
      completed: { type: "boolean", default: false },
      user_id: { type: "uuid", references: "auth.users(id)" },
      created_at: { type: "timestamptz", default: "now()" },
    },
  },
};

const db = new Database("App", schema, { supabase: config });

// Generate SQL migration for Supabase
const sql = generateSupabaseMigration(
  schema,
  { todos: "todos" },
  {
    enableRLS: true,
    includeTimestamps: true,
    includePolicies: true,
  }
);
console.log(sql);
// Copy output to Supabase Dashboard SQL Editor or migration file
```

## Dependencies

- `@supabase/supabase-js`: Supabase client (peer dependency)
- TypeScript: For type safety
- tsup: For building

## Browser Support

Requires IndexedDB support (all modern browsers).
