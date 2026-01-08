# Localbase

> [!CAUTION]
> Project is experimental and a WIP. It is not yet live on npm and may have bugs.

A Dexie-like IndexedDB wrapper with Supabase sync capabilities. Localbase provides an easy-to-use API for local-first applications that need to sync with Supabase.

## Features

- 🗄️ **Dexie-like API** - Familiar interface for IndexedDB operations
- 🔄 **Live Queries** - Reactive queries that automatically update when data changes
- ☁️ **Supabase Sync** - Optional bidirectional sync with Supabase
- 📱 **Offline-First** - Works completely offline, syncs when online
- ⚡ **Type-Safe** - Full TypeScript support
- 🎯 **Conflict Resolution** - Configurable conflict resolution strategies

## Installation

```bash
npm install localbase @supabase/supabase-js
```

## Quick Start

### Basic Usage (Without Supabase)

```typescript
import { Database } from "localbase";

const db = new Database("MyApp", {
  users: "++id, name, email, *tags",
  posts: "++id, userId, title, content, createdAt",
});

await db.open();

// Add data
await db.table("users").add({
  name: "John Doe",
  email: "john@example.com",
  tags: ["developer", "typescript"],
});

// Query data
const users = await db
  .table("users")
  .query()
  .where("email")
  .equals("john@example.com")
  .toArray();

// Live queries
const unsubscribe = db
  .table("users")
  .live()
  .where("name")
  .startsWith("John")
  .subscribe((users) => {
    console.log("Users updated:", users);
  });
```

### With Supabase Sync

```typescript
import { Database } from "localbase";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient("YOUR_SUPABASE_URL", "YOUR_SUPABASE_KEY");

const db = new Database(
  "MyApp",
  {
    users: "++id, name, email",
    posts: "++id, userId, title, content",
  },
  {
    supabase: {
      client: supabase,
      tables: {
        users: "users", // Map local table to Supabase table
        posts: "posts",
      },
      sync: {
        strategy: "bidirectional",
        conflictResolution: "last-write-wins",
        autoSync: true,
        syncInterval: 5000, // Sync every 5 seconds
        realtime: true, // Enable real-time updates
      },
    },
  }
);

await db.open();

// Manual sync
await db.sync.push(); // Push local changes to Supabase
await db.sync.pull(); // Pull changes from Supabase
await db.sync.full(); // Full bidirectional sync
```

## API Reference

### Database

#### Constructor

```typescript
new Database(name: string, schema: TableSchema, config?: DatabaseConfig)
```

- `name`: Database name
- `schema`: Table schema definition (Dexie-style)
- `config`: Optional configuration including Supabase settings

#### Methods

- `open()`: Open the database
- `close()`: Close the database
- `delete()`: Delete the database
- `table<T>(name: string)`: Get a table instance
- `transaction()`: Execute a transaction

### Table

#### CRUD Operations

```typescript
// Add
await db.table("users").add({ name: "John", email: "john@example.com" });

// Get
const user = await db.table("users").get(1);

// Update
await db.table("users").update(1, { name: "Jane" });

// Put (upsert)
await db.table("users").put({ id: 1, name: "John", email: "john@example.com" });

// Delete
await db.table("users").delete(1);

// Clear
await db.table("users").clear();

// Count
const count = await db.table("users").count();
```

#### Queries

```typescript
// Where clauses
const users = await db
  .table("users")
  .query()
  .where("age")
  .above(18)
  .where("name")
  .startsWith("John")
  .toArray();

// Filter
const activeUsers = await db
  .table("users")
  .query()
  .filter((user) => user.active === true)
  .toArray();

// Sort
const sorted = await db.table("users").query().sort("name", "asc").toArray();

// Limit and offset
const page = await db.table("users").query().offset(10).limit(20).toArray();
```

#### Live Queries

```typescript
const unsubscribe = db
  .table("users")
  .live()
  .where("age")
  .above(18)
  .subscribe((users) => {
    console.log("Updated users:", users);
  });

// Unsubscribe when done
unsubscribe();
```

### Sync

When Supabase is configured, you can use the sync API:

```typescript
// Push local changes to Supabase
await db.sync.push();

// Pull changes from Supabase
await db.sync.pull();

// Full bidirectional sync
await db.sync.full();

// Stop auto-sync
db.sync.stop();
```

## Schema Definition

Localbase uses Dexie-style schema definitions:

```typescript
{
  users: '++id, name, email, *tags',
  posts: '++id, userId, title, content'
}
```

- `++id`: Auto-increment primary key
- `name`: Regular field (can be used as index)
- `*tags`: Multi-entry index
- `&email`: Unique index

## Conflict Resolution

Localbase supports multiple conflict resolution strategies:

- `'last-write-wins'`: Use the most recent timestamp
- `'local-wins'`: Always prefer local changes
- `'remote-wins'`: Always prefer remote changes
- Custom function: Define your own resolution logic

```typescript
{
  sync: {
    conflictResolution: async (conflict) => {
      // Custom resolution logic
      return conflict.local; // or conflict.remote
    };
  }
}
```

## License

MIT
