import type { Page } from "@playwright/test";

export type ShareWrapRecord = {
  id: string;
  ed25519Seed: number[];
  ed25519PublicKey: number[];
  mlkemDecapsulationKey: number[];
  mlkemEncapsulationKey: number[];
};

/** Read every wrap-key row from IndexedDB (used to re-seed a stale "pending" row). */
export async function exportShareWrapRecords(page: Page): Promise<ShareWrapRecord[]> {
  return page.evaluate(async () => {
    const records: ShareWrapRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("okkey.share-wrap", 1);
      req.onerror = () => reject(req.error ?? new Error("idb open failed"));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keys")) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction("keys", "readonly");
        const getAll = tx.objectStore("keys").getAll();
        getAll.onsuccess = () => {
          for (const row of getAll.result as Array<Record<string, unknown>>) {
            const id = typeof row.id === "string" ? row.id : "";
            if (!id) continue;
            const toArr = (value: unknown): number[] => {
              if (value instanceof ArrayBuffer) {
                return Array.from(new Uint8Array(value));
              }
              if (ArrayBuffer.isView(value)) {
                const view = value as ArrayBufferView;
                return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
              }
              return [];
            };
            records.push({
              id,
              ed25519Seed: toArr(row.ed25519Seed),
              ed25519PublicKey: toArr(row.ed25519PublicKey),
              mlkemDecapsulationKey: toArr(row.mlkemDecapsulationKey),
              mlkemEncapsulationKey: toArr(row.mlkemEncapsulationKey),
            });
          }
          db.close();
          resolve();
        };
        getAll.onerror = () => reject(getAll.error ?? new Error("idb getAll failed"));
      };
    });
    return records;
  });
}

/** Write wrap-key rows (e.g. only `id: "pending"`) into a wiped profile. */
export async function importShareWrapRecords(
  page: Page,
  records: ShareWrapRecord[],
): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("okkey.share-wrap", 1);
      req.onerror = () => reject(req.error ?? new Error("idb open failed"));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keys", "readwrite");
        const store = tx.objectStore("keys");
        for (const row of rows) {
          store.put({
            id: row.id,
            ed25519Seed: new Uint8Array(row.ed25519Seed).buffer,
            ed25519PublicKey: new Uint8Array(row.ed25519PublicKey).buffer,
            mlkemDecapsulationKey: new Uint8Array(row.mlkemDecapsulationKey).buffer,
            mlkemEncapsulationKey: new Uint8Array(row.mlkemEncapsulationKey).buffer,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error("idb put failed"));
      };
    });
  }, records);
}

/** Delete only the pending registration wrap row (user-scoped rows stay). */
export async function clearPendingShareWrapRecord(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("okkey.share-wrap", 1);
      req.onerror = () => reject(req.error ?? new Error("idb open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keys")) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").delete("pending");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"));
      };
    });
  });
}

export async function listShareWrapIds(page: Page): Promise<string[]> {
  const rows = await exportShareWrapRecords(page);
  return rows.map((row) => row.id);
}
