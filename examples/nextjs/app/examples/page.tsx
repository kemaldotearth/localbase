"use client";

import { useEffect, useState } from "react";
import { getDatabase, initDatabase } from "../../lib/db";
import { UserFormWithSync } from "../../components/UserFormWithSync";
import { TodoFormWithSync } from "../../components/TodoFormWithSync";
import type { Database } from "../../../../src/index";

/**
 * Examples page showing forms that sync on submit
 */
export default function ExamplesPage() {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function setup() {
      try {
        const database = await initDatabase();
        setDb(database);
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        setLoading(false);
      }
    }

    setup();
  }, []);

  async function handlePushAll() {
    if (!db) return;

    try {
      console.log("[Examples] Pushing all data to Supabase...");
      await db.sync.pushAll();
      alert("All data pushed to Supabase!");
    } catch (error) {
      console.error("Failed to push all:", error);
      alert("Failed to push all data. Check console for details.");
    }
  }

  async function handleCheckPending() {
    if (!db) return;

    try {
      const changeTracker = (db.sync as any).getChangeTracker();
      const pending = await changeTracker.getPendingChanges();
      console.log("Pending changes:", pending);
      alert(
        `Found ${pending.length} pending changes. Check console for details.`
      );
    } catch (error) {
      console.error("Failed to check pending:", error);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p>Loading database...</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Localbase - Sync on Submit Examples</h1>

      <div className="section">
        <h2>Debug Tools</h2>
        <div className="button-group">
          <button onClick={handlePushAll}>Push All Data to Supabase</button>
          <button onClick={handleCheckPending}>Check Pending Changes</button>
        </div>
        <p className="note">
          Use these tools to debug sync issues. "Push All" will sync all
          existing data, not just pending changes.
        </p>
        <p className="note" style={{ marginTop: "0.5rem" }}>
          <strong>Note:</strong> Auto-sync is disabled in this example. Sync
          happens manually on form submit. To enable auto-sync, set{" "}
          <code>autoSync: true</code> in <code>lib/db.ts</code>.
        </p>
      </div>

      <div className="section">
        <h2>Form Examples</h2>
        <p className="note">
          These forms save locally first, then sync to Supabase on submit. Check
          the browser console for detailed logs.
        </p>

        <UserFormWithSync />
        <TodoFormWithSync />
      </div>

      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
        }
        .section {
          margin: 2rem 0;
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .button-group {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        button {
          padding: 0.5rem 1rem;
          background: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #0051cc;
        }
        .note {
          font-size: 0.9em;
          color: #666;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
}
