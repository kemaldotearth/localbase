"use client";

import { useEffect, useState } from "react";
import { getDatabase, initDatabase } from "../lib/db";
import type { Database } from "../../../src/index";

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export function TodoList() {
  const [db, setDb] = useState<Database | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    async function setup() {
      try {
        const database = await initDatabase();
        if (!isMounted) return;

        setDb(database);

        await loadTodos(database);

        unsubscribe = database
          .table("todos")
          .live()
          .sort("createdAt", "desc")
          .subscribe((updatedTodos) => {
            if (isMounted) {
              setTodos(updatedTodos);
            }
          });
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    setup();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  async function loadTodos(database: Database) {
    const allTodos = await database
      .table("todos")
      .query()
      .sort("createdAt", "desc")
      .toArray();
    setTodos(allTodos);
  }

  async function handleToggleTodo(id: number) {
    if (!db) return;

    try {
      const todo = await db.table("todos").get(id);
      if (todo) {
        await db.table("todos").update(id, { completed: !todo.completed });
      }
    } catch (error) {
      console.error("Failed to toggle todo:", error);
    }
  }

  async function handleDeleteTodo(id: number) {
    if (!db) return;

    try {
      await db.table("todos").delete(id);
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  }

  const filteredTodos =
    filter === "all"
      ? todos
      : filter === "active"
      ? todos.filter((t) => !t.completed)
      : todos.filter((t) => t.completed);

  if (loading) {
    return <div>Loading todos...</div>;
  }

  return (
    <div>
      <div className="filters">
        <button
          onClick={() => setFilter("all")}
          className={filter === "all" ? "active" : ""}
        >
          All ({todos.length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={filter === "active" ? "active" : ""}
        >
          Active ({todos.filter((t) => !t.completed).length})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={filter === "completed" ? "active" : ""}
        >
          Completed ({todos.filter((t) => t.completed).length})
        </button>
      </div>

      <ul>
        {filteredTodos.map((todo) => (
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

      <style jsx>{`
        .filters {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .filters button {
          padding: 0.5rem 1rem;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
        }
        .filters button.active {
          background: #0070f3;
          color: white;
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
