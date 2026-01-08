import { useEffect, useState } from "react";
import { getDatabase, initDatabase } from "../lib/db";
import type { Database } from "../../../src/index";

export function useDatabase() {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function setup() {
      try {
        const database = await initDatabase();
        setDb(database);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    setup();
  }, []);

  return { db, loading, error };
}

export function useTable<T = any>(tableName: string) {
  const { db, loading, error } = useDatabase();
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    if (!db || loading) return;

    async function loadData() {
      try {
        const items = await db!.table<T>(tableName).getAll();
        setData(items);
      } catch (err) {
        console.error(`Failed to load ${tableName}:`, err);
      }
    }

    loadData();

    const unsubscribe = db
      .table<T>(tableName)
      .live()
      .subscribe((updatedData) => {
        setData(updatedData);
      });

    return () => {
      unsubscribe();
    };
  }, [db, loading, tableName]);

  const add = async (item: T) => {
    if (!db) throw new Error("Database not initialized");
    return db.table<T>(tableName).add(item);
  };

  const update = async (key: any, changes: Partial<T>) => {
    if (!db) throw new Error("Database not initialized");
    return db.table<T>(tableName).update(key, changes);
  };

  const remove = async (key: any) => {
    if (!db) throw new Error("Database not initialized");
    return db.table<T>(tableName).delete(key);
  };

  const get = async (key: any) => {
    if (!db) throw new Error("Database not initialized");
    return db.table<T>(tableName).get(key);
  };

  return {
    data,
    loading,
    error,
    add,
    update,
    remove,
    get,
    db,
  };
}
