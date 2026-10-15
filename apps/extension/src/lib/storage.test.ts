import test from "node:test";
import assert from "node:assert/strict";

import {
  isLoopbackHostname,
  normalizeWebBaseUrl,
  resolveApiBaseFromWebBase,
  STORAGE_KEYS,
  wipeAllExtensionData,
} from "./storage.ts";

test("normalizeWebBaseUrl adds https and strips path", () => {
  assert.equal(normalizeWebBaseUrl("okkey.app"), "https://okkey.app");
  assert.equal(normalizeWebBaseUrl("http://localhost:5173/foo"), "http://localhost:5173");
});

test("resolveApiBaseFromWebBase maps loopback web to :4000 only", () => {
  assert.equal(resolveApiBaseFromWebBase("http://localhost:5173"), "http://localhost:4000");
  assert.equal(resolveApiBaseFromWebBase("http://127.0.0.1:5173"), "http://127.0.0.1:4000");
  assert.equal(resolveApiBaseFromWebBase("http://[::1]:5173"), "http://[::1]:4000");
});

test("resolveApiBaseFromWebBase keeps custom domain / LAN origin (no :4000)", () => {
  assert.equal(resolveApiBaseFromWebBase("https://okkey.app"), "https://okkey.app");
  assert.equal(resolveApiBaseFromWebBase("https://vault.example.com"), "https://vault.example.com");
  assert.equal(resolveApiBaseFromWebBase("https://vault.example.com:8443"), "https://vault.example.com:8443");
  assert.equal(resolveApiBaseFromWebBase("http://192.168.1.10:8080"), "http://192.168.1.10:8080");
  assert.equal(resolveApiBaseFromWebBase("https://okkey.local"), "https://okkey.local");
});

test("isLoopbackHostname", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("vault.example.com"), false);
  assert.equal(isLoopbackHostname("localhost.example.com"), false);
});

test("wipeAllExtensionData removes vault device unlock/prefs and keeps lastServer", async () => {
  const store: Record<string, unknown> = {
    [STORAGE_KEYS.lastServer]: {
      hostMode: "self-hosted",
      webBaseUrl: "https://vault.example.com",
      updatedAt: 1,
    },
    [STORAGE_KEYS.session]: { access_token: "t", user_id: "u1", expires_at: "2099-01-01T00:00:00Z" },
    [STORAGE_KEYS.profile]: {
      webBaseUrl: "https://vault.example.com",
      apiBaseUrl: "https://vault.example.com",
      updatedAt: 1,
    },
    "okkey.extension.deviceId": "dev-1",
    "okkey.extension.vaultBundle.u.u1": { v: 1 },
    "okkey.vault.deviceUnlock.v1.u.u1": JSON.stringify({ pin: { kdfSaltB64: "s", ciphertextB64: "c" } }),
    "okkey.vault.devicePrefs.v1.u.u1": JSON.stringify({ pinEnabled: true }),
    "okkey.vault.pinAttempts.v1.u.u1": JSON.stringify({ failures: [], lockedUntil: null }),
    "unrelated.key": "keep-me",
  };

  const g = globalThis as {
    browser?: {
      storage?: {
        local?: {
          get: (keys?: unknown) => Promise<Record<string, unknown>>;
          remove: (keys: string | string[]) => Promise<void>;
        };
      };
    };
  };
  const prevBrowser = g.browser;
  try {
    g.browser = {
      storage: {
        local: {
          async get(keys) {
            if (keys == null) {
              return { ...store };
            }
            return {};
          },
          async remove(keys) {
            const list = Array.isArray(keys) ? keys : [keys];
            for (const key of list) {
              delete store[key];
            }
          },
        },
      },
    };

    await wipeAllExtensionData();

    assert.ok(store[STORAGE_KEYS.lastServer], "lastServer preference must survive wipe");
    assert.equal(store["unrelated.key"], "keep-me");
    assert.equal(store[STORAGE_KEYS.session], undefined);
    assert.equal(store[STORAGE_KEYS.profile], undefined);
    assert.equal(store["okkey.extension.deviceId"], undefined);
    assert.equal(store["okkey.extension.vaultBundle.u.u1"], undefined);
    assert.equal(store["okkey.vault.deviceUnlock.v1.u.u1"], undefined);
    assert.equal(store["okkey.vault.devicePrefs.v1.u.u1"], undefined);
    assert.equal(store["okkey.vault.pinAttempts.v1.u.u1"], undefined);
  } finally {
    g.browser = prevBrowser;
  }
});
