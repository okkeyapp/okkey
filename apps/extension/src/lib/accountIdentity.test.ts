import assert from "node:assert/strict";
import test from "node:test";

import { readAccountIdentity, STORAGE_KEYS, writeAccountIdentity } from "./storage.ts";

type StorageAreaMock = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function installLocalStorage(store: Record<string, unknown>): () => void {
  const g = globalThis as {
    browser?: { storage?: { local?: StorageAreaMock } };
    chrome?: { storage?: { local?: StorageAreaMock } };
  };
  const prevBrowser = g.browser;
  const prevChrome = g.chrome;
  const local: StorageAreaMock = {
    async get(keys) {
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      return { ...store };
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete store[key];
      }
    },
  };
  g.chrome = { storage: { local } };
  g.browser = { storage: { local } };
  return () => {
    g.browser = prevBrowser;
    g.chrome = prevChrome;
  };
}

test("account identity cache keeps an email when the name is empty", async () => {
  const store: Record<string, unknown> = {};
  const restore = installLocalStorage(store);
  try {
    await writeAccountIdentity({
      email: "ada@example.com",
      firstName: "  ",
      lastName: "",
    });
    assert.deepEqual(await readAccountIdentity(), {
      email: "ada@example.com",
      firstName: "",
      lastName: "",
    });
  } finally {
    restore();
  }
});

test("account identity cache survives a storage rehydrate", async () => {
  const store: Record<string, unknown> = {};
  const restore = installLocalStorage(store);
  try {
    await writeAccountIdentity({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    assert.equal(typeof store[STORAGE_KEYS.accountIdentity], "object");
    assert.deepEqual(await readAccountIdentity(), {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  } finally {
    restore();
  }
});

test("account identity cache ignores a record with no email", async () => {
  const store: Record<string, unknown> = {};
  const restore = installLocalStorage(store);
  try {
    await writeAccountIdentity({ email: "  ", firstName: "Ada", lastName: "Lovelace" });
    assert.equal(store[STORAGE_KEYS.accountIdentity], undefined);
    assert.equal(await readAccountIdentity(), null);
  } finally {
    restore();
  }
});
