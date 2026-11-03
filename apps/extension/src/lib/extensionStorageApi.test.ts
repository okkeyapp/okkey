import test from "node:test";
import assert from "node:assert/strict";

import { extensionLocalStorage, extensionSessionStorage } from "./extensionStorageApi.ts";

type FakeArea = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function fakeArea(tag: string): FakeArea {
  return {
    async get() {
      return { tag };
    },
    async set() {},
    async remove() {},
  };
}

test("extensionLocalStorage prefers chrome.storage.local when both APIs exist", async () => {
  const g = globalThis as {
    chrome?: { storage?: { local?: FakeArea; session?: FakeArea } };
    browser?: { storage?: { local?: FakeArea; session?: FakeArea } };
  };
  const prevChrome = g.chrome;
  const prevBrowser = g.browser;
  try {
    g.chrome = { storage: { local: fakeArea("chrome-local") } };
    // Partial browser (runtime-like world): storage missing — must not be chosen.
    g.browser = {} as { storage?: { local?: FakeArea } };
    const area = extensionLocalStorage();
    assert.ok(area);
    const bag = await area!.get("x");
    assert.equal(bag.tag, "chrome-local");
  } finally {
    g.chrome = prevChrome;
    g.browser = prevBrowser;
  }
});

test("extensionLocalStorage falls back to browser.storage.local when chrome has none", async () => {
  const g = globalThis as {
    chrome?: { storage?: { local?: FakeArea } };
    browser?: { storage?: { local?: FakeArea } };
  };
  const prevChrome = g.chrome;
  const prevBrowser = g.browser;
  try {
    g.chrome = {};
    g.browser = { storage: { local: fakeArea("browser-local") } };
    const area = extensionLocalStorage();
    assert.ok(area);
    const bag = await area!.get("x");
    assert.equal(bag.tag, "browser-local");
  } finally {
    g.chrome = prevChrome;
    g.browser = prevBrowser;
  }
});

test("extensionLocalStorage returns null when storage API is unavailable", () => {
  const g = globalThis as {
    chrome?: { storage?: { local?: FakeArea } };
    browser?: { storage?: { local?: FakeArea } };
  };
  const prevChrome = g.chrome;
  const prevBrowser = g.browser;
  try {
    g.chrome = {};
    g.browser = {};
    assert.equal(extensionLocalStorage(), null);
    assert.equal(extensionSessionStorage(), null);
  } finally {
    g.chrome = prevChrome;
    g.browser = prevBrowser;
  }
});

test("extensionLocalStorage no-ops safely when browser.storage is undefined (partial API)", async () => {
  const g = globalThis as {
    chrome?: { storage?: { local?: FakeArea } };
    browser?: { storage?: { local?: FakeArea }; runtime?: { id?: string } };
  };
  const prevChrome = g.chrome;
  const prevBrowser = g.browser;
  try {
    // Mimic @wxt-dev/browser pick: browser has runtime.id but no storage.
    g.browser = { runtime: { id: "ext-id" } } as {
      storage?: { local?: FakeArea };
      runtime?: { id?: string };
    };
    g.chrome = { storage: { local: fakeArea("chrome-local") } };
    const area = extensionLocalStorage();
    assert.ok(area);
    const bag = await area!.get("okkey.theme");
    assert.equal(bag.tag, "chrome-local");
  } finally {
    g.chrome = prevChrome;
    g.browser = prevBrowser;
  }
});
