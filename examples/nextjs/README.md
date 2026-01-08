# Localbase + Next.js Example

This example demonstrates how to use Localbase with Next.js 13+ (App Router).

## Setup

1. Install dependencies:

```bash
npm install localbase @supabase/supabase-js
```

**Note:** This example imports from the local source (`../../../src/index`).
When using the published package, update the import in `lib/db.ts`:

```typescript
// Change from:
import { Database } from "../../../src/index";

// To:
import { Database } from "localbase";
```

2. Create a `.env.local` file with your Supabase credentials (optional, only if using sync):

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Key Points

### Auto-Sync Configuration

**By default, auto-sync is DISABLED** in these examples. This means:

- Sync only happens when you explicitly call `db.sync.push()` (e.g., on form submit)
- No background syncing every few seconds
- You have full control over when sync happens

To enable automatic background syncing:

- Set `autoSync: true` in `lib/db.ts`
- It will sync every `syncInterval` milliseconds (default: 5000ms = 5 seconds)
- Use `db.sync.stop()` to stop auto-sync if needed

### Client-Side Only

IndexedDB is browser-only, so Localbase can only be used in client components. Make sure to:

- Use `"use client"` directive in components that use the database
- Initialize the database in `useEffect` hooks
- Never import or use the database in server components or API routes

### Auto-Sync Configuration

By default, auto-sync is **disabled** in the examples. Sync happens manually on form submit. To enable auto-sync, change `autoSync: false` to `autoSync: true` in `lib/db.ts`.

**Note:** Auto-sync will sync every few seconds automatically. For form-based syncing, keep it disabled and sync on submit.

### Database Initialization

The `lib/db.ts` file provides a singleton database instance:

```typescript
import { getDatabase, initDatabase } from "./lib/db";

// In a component
useEffect(() => {
  async function setup() {
    const db = await initDatabase();
    // Use db...
  }
  setup();
}, []);
```

### Live Queries

Localbase's live queries work great with React state:

```typescript
const [todos, setTodos] = useState([]);

useEffect(() => {
  const db = await initDatabase();

  // Subscribe to live updates
  const unsubscribe = db
    .table("todos")
    .live()
    .subscribe((updatedTodos) => {
      setTodos(updatedTodos);
    });

  return () => unsubscribe();
}, []);
```

### Custom Hooks

The `hooks/useDatabase.ts` file provides reusable hooks:

```typescript
import { useTable } from "./hooks/useDatabase";

function MyComponent() {
  const { data, add, update, remove } = useTable("todos");

  // data is automatically updated via live queries
  // add, update, remove are helper functions
}
```

## File Structure

```
examples/nextjs/
├── app/
│   ├── page.tsx          # Main page example
│   └── layout.tsx        # Root layout
├── components/
│   └── TodoList.tsx      # Example component
├── hooks/
│   └── useDatabase.ts    # Custom React hooks
├── lib/
│   └── db.ts             # Database initialization
└── README.md
```

## Running the Example

1. Navigate to the example directory:

```bash
cd examples/nextjs
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Features Demonstrated

- ✅ Database initialization in Next.js
- ✅ Client-side only usage
- ✅ Live queries with React state
- ✅ CRUD operations
- ✅ Custom React hooks
- ✅ Supabase sync (optional)
- ✅ **Sync on form submit** - See examples in `examples/onSubmit-sync.md`
- ✅ TypeScript support

## Notes

- The database persists across page navigations
- Live queries automatically update React state
- Sync with Supabase is optional - works offline-first
- All operations are async and should be awaited
