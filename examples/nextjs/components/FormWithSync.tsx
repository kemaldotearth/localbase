"use client";

import { useState, useEffect } from "react";
import { getDatabase, initDatabase } from "../lib/db";
import type { Database } from "../../../src/index";

/**
 * Example component showing form submission with sync
 */
export function FormWithSync() {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");

  // Initialize database
  useEffect(() => {
    initDatabase().then(setDb).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !formData.name || !formData.email) return;

    setLoading(true);
    setSyncStatus("syncing");

    try {
      // 1. Save to local IndexedDB
      await db.table("users").add({
        name: formData.name,
        email: formData.email,
        tags: [],
      });

      // 2. Sync to Supabase on form submit
      await db.sync.push();

      setSyncStatus("success");
      setFormData({ name: "", email: "" });

      // Reset status after 2 seconds
      setTimeout(() => setSyncStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to submit form:", error);
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit & Sync"}
        </button>
      </form>

      {syncStatus === "syncing" && <p>Syncing to Supabase...</p>}
      {syncStatus === "success" && (
        <p style={{ color: "green" }}>✓ Saved and synced!</p>
      )}
      {syncStatus === "error" && (
        <p style={{ color: "red" }}>✗ Sync failed. Data saved locally.</p>
      )}

      <style jsx>{`
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
      `}</style>
    </div>
  );
}
