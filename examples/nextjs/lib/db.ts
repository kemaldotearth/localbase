/**
 * Database instance for Next.js
 * This should be used in client components only (IndexedDB is browser-only)
 *
 * Note: In this example, we import from the local source.
 * When using the published package, change the import to:
 * import { Database } from "supalocal";
 */

import { Database } from "../../../src/index";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client (if using sync)
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    : null;

// Database schema
const schema = {
  users: "++id, name, email, *tags",
  posts: "++id, userId, title, content, createdAt",
  todos: "++id, title, completed, userId, createdAt",
};

// Create database instance
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  // Only create instance on client side
  if (typeof window === "undefined") {
    throw new Error("Database can only be used on the client side");
  }

  if (!dbInstance) {
    dbInstance = new Database("MyNextApp", schema, {
      supabase: supabase
        ? {
            client: supabase,
            tables: {
              users: "users",
              posts: "posts",
              todos: "todos",
            },
            sync: {
              strategy: "bidirectional",
              conflictResolution: "last-write-wins",
              autoSync: false, // Set to true to enable automatic syncing every syncInterval ms
              syncInterval: 5000, // Only used if autoSync is true (syncs every 5 seconds)
              realtime: false, // Set to true to enable Supabase real-time subscriptions
            },
          }
        : undefined,
    });
  }

  return dbInstance;
}

// Initialize database (call this in useEffect)
export async function initDatabase(): Promise<Database> {
  const db = getDatabase();
  await db.open();
  return db;
}
