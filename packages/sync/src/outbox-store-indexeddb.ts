import type { OutboxEntry, OutboxStore } from "./outbox.js";

export interface IndexedDbOutboxStoreOptions {
  dbName?: string;
  storeName?: string;
  dbVersion?: number;
}

const DEFAULT_DB_NAME = "okkey-sync";
const DEFAULT_STORE_NAME = "outbox_entries";
const DEFAULT_DB_VERSION = 1;

function cloneEntry(entry: OutboxEntry): OutboxEntry {
  return {
    ...entry,
    request: { ...entry.request },
  };
}

function openDb(dbName: string, storeName: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const req = globalThis.indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("INDEXEDDB_TX_FAILED"));
    tx.onabort = () => reject(tx.error ?? new Error("INDEXEDDB_TX_ABORTED"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_REQUEST_FAILED"));
  });
}

export class IndexedDbOutboxStore implements OutboxStore {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly dbVersion: number;

  constructor(options: IndexedDbOutboxStoreOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.dbVersion = options.dbVersion ?? DEFAULT_DB_VERSION;
  }

  async load(): Promise<OutboxEntry[]> {
    const db = await openDb(this.dbName, this.storeName, this.dbVersion);
    try {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const rows = await reqToPromise<OutboxEntry[]>(store.getAll());
      await txDone(tx);
      return (rows ?? [])
        .map((row) => cloneEntry(row))
        .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    } finally {
      db.close();
    }
  }

  async save(entries: OutboxEntry[]): Promise<void> {
    const db = await openDb(this.dbName, this.storeName, this.dbVersion);
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      store.clear();
      for (const entry of entries) {
        store.put(cloneEntry(entry));
      }
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}
