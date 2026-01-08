# Syncing on Form Submit Examples

This document shows different patterns for syncing data to Supabase when forms are submitted.

## Important: Auto-Sync vs Manual Sync

By default, **auto-sync is disabled** in these examples. This means sync only happens when you explicitly call `db.sync.push()` (like on form submit).

If you want automatic background syncing, set `autoSync: true` in your database config. This will sync every `syncInterval` milliseconds (default: 5000ms = 5 seconds).

**For form-based syncing**, keep `autoSync: false` and sync manually on submit.

## Basic Pattern: Sync After Save

The simplest pattern is to save locally first, then sync:

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  // 1. Save to local IndexedDB
  await db.table("users").add({
    name: formData.name,
    email: formData.email,
  });

  // 2. Sync to Supabase
  await db.sync.push();
}
```

## Pattern 1: Sync on Individual Form Submit

Sync immediately after each form submission:

```typescript
"use client";

import { useState } from "react";
import { useDatabase } from "../hooks/useDatabase";

export function UserForm() {
  const { db, add } = useTable("users");
  const [formData, setFormData] = useState({ name: "", email: "" });
  const [syncing, setSyncing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    setSyncing(true);
    try {
      // Save locally
      await add(formData);

      // Sync to Supabase
      await db.sync.push();

      setFormData({ name: "", email: "" });
    } catch (error) {
      console.error("Submit failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Name"
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
      />
      <button type="submit" disabled={syncing}>
        {syncing ? "Syncing..." : "Submit"}
      </button>
    </form>
  );
}
```

## Pattern 2: Batch Sync on Submit

Collect multiple changes and sync them all at once:

```typescript
"use client";

import { useState } from "react";
import { useDatabase } from "../hooks/useDatabase";

export function MultiStepForm() {
  const { db } = useDatabase();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    address: "",
  });

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    try {
      // Save all form data locally
      await db.table("users").add({
        name: formData.name,
        email: formData.email,
      });

      await db.table("addresses").add({
        userId: userId, // from previous step
        address: formData.address,
      });

      // Sync all changes at once
      await db.sync.push();

      alert("Form submitted and synced!");
    } catch (error) {
      console.error("Submit failed:", error);
    }
  };

  // ... form steps ...
}
```

## Pattern 3: Sync with Error Handling

Handle sync errors gracefully:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!db) return;

  try {
    // Always save locally first (works offline)
    await db.table("users").add(formData);

    // Try to sync, but don't fail if it doesn't work
    try {
      await db.sync.push();
      console.log("✓ Synced to Supabase");
    } catch (syncError) {
      console.warn("⚠ Sync failed, but data saved locally:", syncError);
      // Data is still saved locally and will sync later
    }

    setFormData({ name: "", email: "" });
  } catch (error) {
    console.error("Failed to save:", error);
  }
};
```

## Pattern 4: Sync with User Feedback

Show sync status to the user:

```typescript
const [syncStatus, setSyncStatus] = useState<
  "idle" | "syncing" | "success" | "error"
>("idle");

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!db) return;

  setSyncStatus("syncing");

  try {
    await db.table("users").add(formData);
    await db.sync.push();

    setSyncStatus("success");
    setFormData({ name: "", email: "" });

    setTimeout(() => setSyncStatus("idle"), 2000);
  } catch (error) {
    setSyncStatus("error");
    setTimeout(() => setSyncStatus("idle"), 3000);
  }
};

return (
  <form onSubmit={handleSubmit}>
    {/* form fields */}
    {syncStatus === "syncing" && <p>Syncing...</p>}
    {syncStatus === "success" && <p>✓ Saved and synced!</p>}
    {syncStatus === "error" && <p>✗ Sync failed. Data saved locally.</p>}
  </form>
);
```

## Pattern 5: Debounced Sync

Sync after a delay to batch multiple rapid changes:

```typescript
import { useRef } from "react";

const syncTimeoutRef = useRef<NodeJS.Timeout>();

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!db) return;

  // Save locally immediately
  await db.table("users").add(formData);

  // Clear any pending sync
  if (syncTimeoutRef.current) {
    clearTimeout(syncTimeoutRef.current);
  }

  // Schedule sync after 1 second (batches rapid submissions)
  syncTimeoutRef.current = setTimeout(async () => {
    try {
      await db.sync.push();
      console.log("Batched sync completed");
    } catch (error) {
      console.error("Sync failed:", error);
    }
  }, 1000);
};
```

## Pattern 6: Full Sync (Pull + Push)

Sync both ways on submit:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!db) return;

  try {
    // Save locally
    await db.table("users").add(formData);

    // Full bidirectional sync
    await db.sync.full(); // Pulls remote changes, then pushes local changes

    setFormData({ name: "", email: "" });
  } catch (error) {
    console.error("Submit failed:", error);
  }
};
```

## Pattern 7: Using Custom Hook

Create a reusable hook for form submission with sync:

```typescript
// hooks/useFormWithSync.ts
import { useState } from "react";
import { useDatabase } from "./useDatabase";

export function useFormWithSync<T>(tableName: string) {
  const { db } = useDatabase();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submit = async (data: T, sync: boolean = true) => {
    if (!db) throw new Error("Database not initialized");

    setSyncing(true);
    setError(null);

    try {
      // Save locally
      await db.table(tableName).add(data);

      // Sync if requested
      if (sync) {
        await db.sync.push();
      }

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  return { submit, syncing, error };
}

// Usage
function MyForm() {
  const { submit, syncing, error } = useFormWithSync("users");
  const [formData, setFormData] = useState({ name: "", email: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submit(formData);
      setFormData({ name: "", email: "" });
    } catch (err) {
      // Error already set in hook
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button disabled={syncing}>Submit</button>
      {error && <p>Error: {error.message}</p>}
    </form>
  );
}
```

## Best Practices

1. **Always save locally first** - This ensures data is saved even if sync fails
2. **Handle sync errors gracefully** - Don't fail the entire operation if sync fails
3. **Provide user feedback** - Let users know when sync is happening
4. **Consider offline scenarios** - Data should work offline, sync when online
5. **Use pushAll() for initial sync** - If you need to sync all existing data

## When to Use Each Pattern

- **Pattern 1**: Simple forms, immediate sync needed
- **Pattern 2**: Multi-step forms, batch operations
- **Pattern 3**: When sync failures shouldn't block the user
- **Pattern 4**: When user feedback is important
- **Pattern 5**: When you expect rapid submissions
- **Pattern 6**: When you need the latest remote data too
- **Pattern 7**: When you have many forms and want reusable logic
