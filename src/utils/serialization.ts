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

  if (Array.isArray(key)) {
    return key.map((k) => serializeKey(k)) as any;
  }

  if (typeof key === "object") {
    const keys = Object.keys(key);
    if (keys.length === 1) {
      return serializeKey(key[keys[0]]);
    }
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
