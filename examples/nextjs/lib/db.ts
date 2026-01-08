import {
  Database,
  generateSupabaseMigration,
  type ExtendedTableSchema,
} from "../../../src/index";
import { createClient } from "@supabase/supabase-js";

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    : null;

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

const tableMapping = {
  users: "users",
  posts: "posts",
  todos: "todos",
};

let dbInstance: Database | null = null;

export function getDatabase(): Database {
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
              autoSync: false,
              syncInterval: 5000,
              realtime: false,
            },
          }
        : undefined,
    });
  }

  return dbInstance;
}

export async function initDatabase(): Promise<Database> {
  const db = getDatabase();
  await db.open();
  return db;
}

export function getSupabaseMigration(): string {
  return generateSupabaseMigration(schema, tableMapping, {
    enableRLS: true,
    includeTimestamps: true,
    includePolicies: true,
  });
}

export function logSupabaseMigration(): void {
  console.log("=".repeat(60));
  console.log("SUPABASE MIGRATION SQL");
  console.log("Copy this SQL and run it in Supabase Dashboard or CLI");
  console.log("=".repeat(60));
  console.log(getSupabaseMigration());
  console.log("=".repeat(60));
}
