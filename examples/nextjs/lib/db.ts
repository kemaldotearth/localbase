/**
 * Database instance for Next.js
 * This should be used in client components only (IndexedDB is browser-only)
 *
 * Note: In this example, we import from the local source.
 * When using the published package, change the import to:
 * import { Database, generateSupabaseMigration } from "supalocal";
 */

import {
  Database,
  generateSupabaseMigration,
  type ExtendedTableSchema,
} from "../../../src/index";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client (if using sync)
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    : null;

/**
 * Database schema with Supabase column definitions
 *
 * Extended format allows you to define:
 * - keyPath: Primary key definition (++id for auto-increment)
 * - indexes: Fields to index for faster queries
 * - columns: Full column definitions for Supabase schema generation
 */
const schema: Record<string, ExtendedTableSchema> = {
  users: {
    keyPath: "++id",
    indexes: ["email", "name"],
    columns: {
      id: { type: "bigint", primaryKey: true, generated: true },
      name: { type: "text", nullable: false },
      email: { type: "text", nullable: false, unique: true },
      tags: { type: "jsonb", default: "'[]'" },
      created_at: { type: "timestamptz", default: "now()" },
    },
  },
  posts: {
    keyPath: "++id",
    indexes: ["userId", "createdAt"],
    columns: {
      id: { type: "bigint", primaryKey: true, generated: true },
      user_id: { type: "bigint", references: "public.users(id)" },
      title: { type: "text", nullable: false },
      content: { type: "text" },
      created_at: { type: "timestamptz", default: "now()" },
    },
  },
  todos: {
    keyPath: "++id",
    indexes: ["completed", "userId", "createdAt"],
    columns: {
      id: { type: "bigint", primaryKey: true, generated: true },
      title: { type: "text", nullable: false },
      completed: { type: "boolean", default: false },
      user_id: { type: "uuid", references: "auth.users(id)" },
      created_at: { type: "timestamptz", default: "now()" },
    },
  },
};

// Table name mapping (local name -> Supabase table name)
const tableMapping = {
  users: "users",
  posts: "posts",
  todos: "todos",
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
            tables: tableMapping,
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

/**
 * Generate Supabase SQL migration from schema
 *
 * Usage:
 * 1. Call this function to get the SQL
 * 2. Copy the output to a Supabase migration file
 * 3. Run `supabase db push` or apply in Supabase Dashboard
 *
 * Example:
 * ```
 * import { getSupabaseMigration } from './lib/db';
 * console.log(getSupabaseMigration());
 * ```
 */
export function getSupabaseMigration(): string {
  return generateSupabaseMigration(schema, tableMapping, {
    enableRLS: true,
    includeTimestamps: true,
    includePolicies: true,
  });
}

/**
 * Log the Supabase migration SQL to the console
 * Useful for development - call this to see the SQL you need
 */
export function logSupabaseMigration(): void {
  console.log("=".repeat(60));
  console.log("SUPABASE MIGRATION SQL");
  console.log("Copy this SQL and run it in Supabase Dashboard or CLI");
  console.log("=".repeat(60));
  console.log(getSupabaseMigration());
  console.log("=".repeat(60));
}
