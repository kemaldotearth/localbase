/**
 * Low-level IndexedDB wrapper utilities
 */

export function openDatabase(
  name: string,
  version: number,
  upgradeCallback: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null
  ) => void
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      upgradeCallback(db, event.oldVersion, event.newVersion);
    };
  });
}

export function createObjectStore(
  db: IDBDatabase,
  name: string,
  keyPath: string | string[] | null,
  autoIncrement: boolean = false
): IDBObjectStore {
  if (db.objectStoreNames.contains(name)) {
    db.deleteObjectStore(name);
  }
  return db.createObjectStore(name, { keyPath, autoIncrement });
}

export function createIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  unique: boolean = false
): IDBIndex {
  if (store.indexNames.contains(name)) {
    store.deleteIndex(name);
  }
  return store.createIndex(name, keyPath, { unique });
}

export function transaction<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode = "readonly"
): Promise<IDBTransaction> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve(transaction);
    resolve(transaction);
  });
}

export function get<T>(
  store: IDBObjectStore,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function getAll<T>(
  store: IDBObjectStore,
  query?: IDBValidKey | IDBKeyRange,
  count?: number
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request =
      query !== undefined ? store.getAll(query, count) : store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function put<T>(
  store: IDBObjectStore,
  value: T,
  key?: IDBValidKey
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    // Only pass key if it's explicitly provided and not undefined/null
    // If keyPath exists on the store, IndexedDB will throw an error if we pass key
    const request =
      key !== undefined && key !== null
        ? store.put(value, key)
        : store.put(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function add<T>(
  store: IDBObjectStore,
  value: T,
  key?: IDBValidKey
): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const request =
      key !== undefined ? store.add(value, key) : store.add(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export function deleteKey(
  store: IDBObjectStore,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export function clear(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export function count(
  store: IDBObjectStore,
  query?: IDBValidKey | IDBKeyRange
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = query !== undefined ? store.count(query) : store.count();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
