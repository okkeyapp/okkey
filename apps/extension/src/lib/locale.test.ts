import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  EXTENSION_LOCALE_STORAGE_KEY,
  loadExtensionLocale,
  readStoredExtensionLocale,
  writeStoredExtensionLocale,
} from "./locale.ts";

type FakeArea = {
  store: Record<string, unknown>;
  get: (keys?: string | string[] | null | Record<string, unknown>) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

const memoryLocalStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key() {
      return null;
    },
    get length() {
      return map.size;
    },
  };
})();

function installFakeChromeStorage(): FakeArea {
  const store: Record<string, unknown> = {};
  const area: FakeArea = {
    store,
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
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete store[key];
      }
    },
  };
  const g = globalThis as {
    chrome?: { storage?: { local?: FakeArea } };
    browser?: { storage?: { local?: FakeArea } };
    localStorage?: typeof memoryLocalStorage;
  };
  g.chrome = { storage: { local: area } };
  g.browser = { storage: { local: area } };
  g.localStorage = memoryLocalStorage;
  return area;
}

beforeEach(() => {
  memoryLocalStorage.clear();
  installFakeChromeStorage();
});

afterEach(() => {
  const g = globalThis as {
    chrome?: unknown;
    browser?: unknown;
  };
  delete g.chrome;
  delete g.browser;
  memoryLocalStorage.clear();
});

describe("extension locale storage", () => {
  it("defaults to Russian when nothing is stored", () => {
    assert.equal(readStoredExtensionLocale(), "ru");
  });

  it("writes locale to chrome.storage.local for content scripts", async () => {
    const area = installFakeChromeStorage();
    await writeStoredExtensionLocale("en");
    assert.equal(area.store[EXTENSION_LOCALE_STORAGE_KEY], "en");
    assert.equal(readStoredExtensionLocale(), "en");
  });

  it("loads chrome.storage value over empty localStorage mirror", async () => {
    const area = installFakeChromeStorage();
    area.store[EXTENSION_LOCALE_STORAGE_KEY] = "en";
    memoryLocalStorage.clear();
    const locale = await loadExtensionLocale();
    assert.equal(locale, "en");
    assert.equal(readStoredExtensionLocale(), "en");
  });

  it("migrates legacy localStorage-only locale into chrome.storage", async () => {
    const area = installFakeChromeStorage();
    memoryLocalStorage.setItem(EXTENSION_LOCALE_STORAGE_KEY, "en");
    delete area.store[EXTENSION_LOCALE_STORAGE_KEY];
    const locale = await loadExtensionLocale();
    assert.equal(locale, "en");
    assert.equal(area.store[EXTENSION_LOCALE_STORAGE_KEY], "en");
  });
});
