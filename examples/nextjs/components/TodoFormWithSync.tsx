"use client";

import { useState, useEffect } from "react";
import { getDatabase, initDatabase } from "../lib/db";
import type { Database } from "../../../src/index";

/**
 * Example: Todo form that syncs to Supabase on submit
 */
export function TodoFormWithSync() {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Initialize database
  useEffect(() => {
    initDatabase().then(setDb).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !title.trim()) return;

    setLoading(true);
    setSyncStatus("syncing");
    setErrorMessage("");

    try {
      console.log("[TodoForm] Adding todo to local database...");

      // 1. Save to local IndexedDB
      const todoId = await db.table("todos").add({
        title: title.trim(),
        completed: false,
        userId: null,
        createdAt: new Date().toISOString(),
      });

      console.log("[TodoForm] Todo added locally with ID:", todoId);

      // 2. Wait a bit to ensure change is tracked
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 3. Check pending changes
      const changeTracker = (db.sync as any).getChangeTracker();
      const pendingChanges = await changeTracker.getPendingChanges("todos");
      console.log(
        "[TodoForm] Pending changes before sync:",
        pendingChanges.length
      );

      // 4. Sync to Supabase on form submit
      console.log("[TodoForm] Syncing to Supabase...");
      await db.sync.push();

      // 5. Verify sync worked
      const pendingAfter = await changeTracker.getPendingChanges("todos");
      console.log(
        "[TodoForm] Pending changes after sync:",
        pendingAfter.length
      );

      setSyncStatus("success");
      setTitle("");

      // Reset status after 2 seconds
      setTimeout(() => setSyncStatus("idle"), 2000);
    } catch (error: any) {
      console.error("[TodoForm] Failed to submit form:", error);
      setSyncStatus("error");
      setErrorMessage(error?.message || "Unknown error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h3>Add Todo (Syncs on Submit)</h3>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Todo title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={loading}
        />
        <button type="submit" disabled={loading || !db}>
          {loading ? "Submitting..." : "Submit & Sync"}
        </button>
      </form>

      <div className="status">
        {syncStatus === "syncing" && (
          <p className="syncing">⏳ Syncing to Supabase...</p>
        )}
        {syncStatus === "success" && (
          <p className="success">✓ Saved and synced to Supabase!</p>
        )}
        {syncStatus === "error" && (
          <div className="error">
            <p>✗ Sync failed. Data saved locally.</p>
            {errorMessage && <p className="error-detail">{errorMessage}</p>}
          </div>
        )}
      </div>

      <style jsx>{`
        .form-container {
          padding: 1rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin: 1rem 0;
        }
        h3 {
          margin-top: 0;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-width: 400px;
        }
        input {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        input:disabled {
          background: #f5f5f5;
        }
        button {
          padding: 0.5rem 1rem;
          background: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .status {
          margin-top: 0.5rem;
        }
        .syncing {
          color: #666;
        }
        .success {
          color: green;
        }
        .error {
          color: red;
        }
        .error-detail {
          font-size: 0.9em;
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
}
