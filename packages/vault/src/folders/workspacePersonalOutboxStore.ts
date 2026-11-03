import type { WorkspacePersonalOutboxEntry, WorkspacePersonalOutboxStore } from "@okkey/sync";

function cloneEntry(entry: WorkspacePersonalOutboxEntry): WorkspacePersonalOutboxEntry {
  return {
    ...entry,
    request: { ...entry.request },
  };
}

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const req = globalThis.indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        db.createObjectStore("entries", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

export class IndexedDbWorkspacePersonalOutboxStore implements WorkspacePersonalOutboxStore {
  private readonly dbName: string;

  constructor(userId: string, workspaceId: string) {
    this.dbName = `okkey-ws-personal-outbox.u.${userId}.w.${workspaceId}`;
  }

  async load(): Promise<WorkspacePersonalOutboxEntry[]> {
    const db = await openDb(this.dbName);
    try {
      const tx = db.transaction("entries", "readonly");
      const store = tx.objectStore("entries");
      const rows = await new Promise<WorkspacePersonalOutboxEntry[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as WorkspacePersonalOutboxEntry[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return rows.map((row) => cloneEntry(row)).sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
    } finally {
      db.close();
    }
  }

  async save(entries: WorkspacePersonalOutboxEntry[]): Promise<void> {
    const db = await openDb(this.dbName);
    try {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      store.clear();
      for (const entry of entries) {
        store.put(cloneEntry(entry));
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}
