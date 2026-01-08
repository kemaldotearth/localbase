/**
 * Serialization utilities for IndexedDB
 */

export function serializeKey(key: any): IDBValidKey {
  if (key === null || key === undefined) {
    throw new Error("Key cannot be null or undefined");
  }

  if (
    typeof key === "string" ||
    typeof key === "number" ||
    key instanceof Date
  ) {
    return key;
  }

  // For composite keys, IndexedDB handles arrays
  if (Array.isArray(key)) {
    return key.map((k) => serializeKey(k)) as any;
  }

  // For objects, try to extract a simple key
  if (typeof key === "object") {
    // If it's a simple object with one property, use that
    const keys = Object.keys(key);
    if (keys.length === 1) {
      return serializeKey(key[keys[0]]);
    }
    // Otherwise, serialize as JSON string (not ideal, but works)
    return JSON.stringify(key);
  }

  return String(key);
}

export function deserializeKey(key: IDBValidKey): any {
  if (typeof key === "string" && key.startsWith("{")) {
    try {
      return JSON.parse(key);
    } catch {
      return key;
    }
  }
  return key;
}
