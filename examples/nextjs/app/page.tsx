"use client";

import { useEffect, useState } from "react";
import { getDatabase, initDatabase } from "../lib/db";
// Note: When using published package, import Database type from "localbase"
import type { Database } from "../../../src/index";

export default function HomePage() {
  const [db, setDb] = useState<Database | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ name: "", email: "" });
  const [newTodo, setNewTodo] = useState({ title: "" });

  useEffect(() => {
    let isMounted = true;
    const unsubscribes: (() => void)[] = [];

    async function setup() {
      try {
        const database = await initDatabase();
        if (!isMounted) return;

        setDb(database);

        // Load initial data
        await loadUsers(database);
        await loadTodos(database);

        // Set up live queries
        const cleanup = setupLiveQueries(database);
        if (cleanup) {
          unsubscribes.push(...cleanup);
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    setup();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, []);

  async function loadUsers(database: Database) {
    const allUsers = await database.table("users").getAll();
    setUsers(allUsers);
  }

  async function loadTodos(database: Database) {
    const allTodos = await database
      .table("todos")
      .query()
      .sort("createdAt", "desc")
      .toArray();
    setTodos(allTodos);
  }

  function setupLiveQueries(database: Database): (() => void)[] {
    const unsubscribes: (() => void)[] = [];

    // Live query for users
    const unsubscribeUsers = database
      .table("users")
      .live()
      .subscribe((updatedUsers) => {
        setUsers(updatedUsers);
      });
    unsubscribes.push(unsubscribeUsers);

    // Live query for todos
    const unsubscribeTodos = database
      .table("todos")
      .live()
      .sort("createdAt", "desc")
      .subscribe((updatedTodos) => {
        setTodos(updatedTodos);
      });
    unsubscribes.push(unsubscribeTodos);

    return unsubscribes;
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!db || !newUser.name || !newUser.email) return;

    try {
      await db.table("users").add({
        name: newUser.name,
        email: newUser.email,
        tags: [],
      });
      setNewUser({ name: "", email: "" });

      // Sync to Supabase on form submit
      await db.sync.push();
      console.log("User added and synced to Supabase");
    } catch (error) {
      console.error("Failed to add user:", error);
    }
  }

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!db || !newTodo.title) return;

    try {
      await db.table("todos").add({
        title: newTodo.title,
        completed: false,
        userId: null,
        createdAt: new Date().toISOString(),
      });
      setNewTodo({ title: "" });

      // Sync to Supabase on form submit
      await db.sync.push();
      console.log("Todo added and synced to Supabase");
    } catch (error) {
      console.error("Failed to add todo:", error);
    }
  }

  async function handleToggleTodo(id: number) {
    if (!db) return;

    try {
      const todo = await db.table("todos").get(id);
      if (todo) {
        await db.table("todos").update(id, { completed: !todo.completed });
        // Sync to Supabase after update
        await db.sync.push();
        console.log("Todo updated and synced to Supabase");
      }
    } catch (error) {
      console.error("Failed to toggle todo:", error);
    }
  }

  async function handleDeleteTodo(id: number) {
    if (!db) return;

    try {
      await db.table("todos").delete(id);
      // Sync to Supabase after delete
      await db.sync.push();
      console.log("Todo deleted and synced to Supabase");
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  }

  async function handleSync() {
    if (!db) return;

    try {
      await db.sync.full();
      alert("Sync completed!");
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check console for details.");
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
      <h1>Localbase + Next.js Example</h1>

      <div className="section">
        <h2>Examples</h2>
        <p>
          <a href="/examples" style={{ color: "#0070f3" }}>
            → View separate form examples with sync on submit
          </a>
        </p>
      </div>

      <div className="section">
        <h2>Sync</h2>
        <button onClick={handleSync}>Manual Sync</button>
        <p style={{ fontSize: "0.9em", color: "#666", marginTop: "0.5rem" }}>
          Note: Forms above sync automatically on submit. Use this button for
          manual sync.
        </p>
      </div>

      <div className="section">
        <h2>Users ({users.length})</h2>
        <form onSubmit={handleAddUser}>
          <input
            type="text"
            placeholder="Name"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
          />
          <button type="submit">Add User</button>
        </form>
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              {user.name} ({user.email})
            </li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Todos ({todos.length})</h2>
        <form onSubmit={handleAddTodo}>
          <input
            type="text"
            placeholder="Todo title"
            value={newTodo.title}
            onChange={(e) => setNewTodo({ title: e.target.value })}
          />
          <button type="submit">Add Todo</button>
        </form>
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => handleToggleTodo(todo.id)}
              />
              <span
                style={{
                  textDecoration: todo.completed ? "line-through" : "none",
                }}
              >
                {todo.title}
              </span>
              <button onClick={() => handleDeleteTodo(todo.id)}>Delete</button>
            </li>
          ))}
        </ul>
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
        form {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        input {
          flex: 1;
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
        button:hover {
          background: #0051cc;
        }
        ul {
          list-style: none;
          padding: 0;
        }
        li {
          padding: 0.5rem;
          margin: 0.5rem 0;
          background: #f5f5f5;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
}
