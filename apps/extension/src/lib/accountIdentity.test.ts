import assert from "node:assert/strict";
import test from "node:test";

import {
  accountIdentityForBar,
  accountIdentityFromProfile,
  accountIdentityPrimaryText,
} from "./accountIdentity.ts";
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

test("account card uses the email when the profile has no name", () => {
  const identity = accountIdentityFromProfile({
    email: "ada@example.com",
    first_name: "  ",
    last_name: null,
  });
  assert.ok(identity);
  const fields = accountIdentityForBar(identity);
  assert.equal(fields.firstName, "");
  assert.equal(fields.lastName, "");
  assert.equal(fields.email, "ada@example.com");
  assert.equal(accountIdentityPrimaryText(fields), "ada@example.com");
  assert.equal(accountIdentityPrimaryText(fields).includes("—"), false);
});

test("account card joins a stored first and last name", () => {
  const identity = accountIdentityFromProfile({
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
  });
  assert.equal(accountIdentityPrimaryText(identity), "Ada Lovelace");
});

test("account identity survives a storage rehydrate after the popup process restarts", async () => {
  const store: Record<string, unknown> = {};
  const restore = installLocalStorage(store);
  try {
    await writeAccountIdentity({
      email: "ada@example.com",
      firstName: "",
      lastName: "  ",
    });
    assert.equal(typeof store[STORAGE_KEYS.accountIdentity], "object");

    // New popup / service-worker realm: only chrome.storage.local remains.
    const rehydrated = await readAccountIdentity();
    assert.deepEqual(rehydrated, {
      email: "ada@example.com",
      firstName: "",
      lastName: "",
    });
    assert.equal(accountIdentityPrimaryText(rehydrated), "ada@example.com");
  } finally {
    restore();
  }
});
