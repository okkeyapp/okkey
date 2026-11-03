import test from "node:test";
import assert from "node:assert/strict";

import {
  isLoopbackHostname,
  normalizeWebBaseUrl,
  readSession,
  resolveApiBaseFromWebBase,
  STORAGE_KEYS,
  clearSessionAfterLostDeviceTrust,
  wipeAllExtensionData,
  WEB_BASE_URL_REQUIRED_ERROR,
  WEB_BASE_URL_SCHEME_ERROR,
} from "./storage.ts";

/** Keep in sync with `VAULT_UNLOCK_SESSION_STORAGE_KEY` in `@okkey/vault`. */
const UNLOCK_SESSION_STORAGE_KEY = "okkey.vault.unlockSession.v1";
const PENDING_SAVE_SESSION_KEY = "okkey.autofill.pendingSaveByTab";

type StorageAreaMock = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear?: () => Promise<void>;
};

function installStorageMocks(input: {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
}): {
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  restore: () => void;
} {
  const store = input.local;
  const sessionStore = input.session;
  const g = globalThis as {
    browser?: {
      storage?: { local?: StorageAreaMock; session?: StorageAreaMock };
      runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> };
    };
    chrome?: {
      storage?: { local?: StorageAreaMock; session?: StorageAreaMock };
    };
  };
  const prevBrowser = g.browser;
  const prevChrome = g.chrome;

  const localArea: StorageAreaMock = {
    async get(keys) {
      if (keys == null) {
        return { ...store };
      }
      if (typeof keys === "string") {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      return {};
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
  const sessionArea: StorageAreaMock = {
    async get(keys) {
      if (typeof keys === "string") {
        return keys in sessionStore ? { [keys]: sessionStore[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in sessionStore) out[key] = sessionStore[key];
        }
        return out;
      }
      return { ...sessionStore };
    },
    async set(items) {
      Object.assign(sessionStore, items);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete sessionStore[key];
      }
    },
    async clear() {
      for (const key of Object.keys(sessionStore)) {
        delete sessionStore[key];
      }
    },
  };

  g.browser = {
    storage: { local: localArea, session: sessionArea },
    runtime: { async sendMessage() { return { ok: true }; } },
  };
  g.chrome = {
    storage: { local: localArea, session: sessionArea },
  };

  return {
    local: store,
    session: sessionStore,
    restore() {
      g.browser = prevBrowser;
      g.chrome = prevChrome;
    },
  };
}

test("normalizeWebBaseUrl adds https and strips path", () => {
  assert.equal(normalizeWebBaseUrl("okkey.app"), "https://okkey.app");
  assert.equal(normalizeWebBaseUrl("http://localhost:5173/foo"), "http://localhost:5173");
  assert.equal(normalizeWebBaseUrl("localhost:8080"), "https://localhost:8080");
});

test("normalizeWebBaseUrl rejects empty input", () => {
  assert.throws(() => normalizeWebBaseUrl(""), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, WEB_BASE_URL_REQUIRED_ERROR);
    return true;
  });
  assert.throws(() => normalizeWebBaseUrl("   "), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, WEB_BASE_URL_REQUIRED_ERROR);
    return true;
  });
});

test("normalizeWebBaseUrl rejects non-http(s) schemes", () => {
  for (const raw of ["ftp://host", "FTP://host", "file:///tmp", "ws://localhost:8080"]) {
    assert.throws(() => normalizeWebBaseUrl(raw), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, WEB_BASE_URL_SCHEME_ERROR);
      return true;
    });
  }
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

test("wipeAllExtensionData clears session storage and local vault keys, keeps lastServer and device identity", async () => {
  const mocks = installStorageMocks({
    local: {
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
      [STORAGE_KEYS.deviceId]: "dev-1",
      [STORAGE_KEYS.deviceFingerprint]: "web_ext-chrome-linux-abc",
      [STORAGE_KEYS.devicePrivateKey]: "c2VlZC1zZWVkLXNlZWQtc2VlZA==",
      [STORAGE_KEYS.devicePublicKey]: "cHViLWtleS0zMi1ieXRlcy1wYWQtISEhISE=",
      "okkey.extension.vaultBundle.u.u1": { v: 1 },
      "okkey.extension.workspace.current.u.u1": "ws-1",
      "okkey.vault.deviceUnlock.v1.u.u1": JSON.stringify({ pin: { kdfSaltB64: "s", ciphertextB64: "c" } }),
      "okkey.vault.devicePrefs.v1.u.u1": JSON.stringify({ pinEnabled: true }),
      "okkey.vault.pinAttempts.v1.u.u1": JSON.stringify({ failures: [], lockedUntil: null }),
      "unrelated.key": "keep-me",
    },
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: JSON.stringify({
        v: 1,
        user_id: "u1",
        vault_key_b64: "AAAA",
        password_share_c_b64: "BBBB",
        last_activity_at: Date.now(),
        idle_lock_ms: 3_600_000,
      }),
      [PENDING_SAVE_SESSION_KEY]: {
        "12": { username: "a", password: "secret", captureUrl: "https://ex.test/login", websiteUrl: "https://ex.test/login", createdAt: Date.now() },
      },
    },
  });

  try {
    await wipeAllExtensionData();

    assert.ok(mocks.local[STORAGE_KEYS.lastServer], "lastServer preference must survive wipe");
    assert.equal(mocks.local["unrelated.key"], "keep-me");
    assert.equal(mocks.local[STORAGE_KEYS.session], undefined);
    assert.equal(mocks.local[STORAGE_KEYS.profile], undefined);
    // Device identity must survive account wipe so re-login can sign bind challenges.
    assert.equal(mocks.local[STORAGE_KEYS.deviceId], "dev-1");
    assert.equal(mocks.local[STORAGE_KEYS.deviceFingerprint], "web_ext-chrome-linux-abc");
    assert.equal(mocks.local[STORAGE_KEYS.devicePrivateKey], "c2VlZC1zZWVkLXNlZWQtc2VlZA==");
    assert.equal(mocks.local[STORAGE_KEYS.devicePublicKey], "cHViLWtleS0zMi1ieXRlcy1wYWQtISEhISE=");
    assert.equal(mocks.local["okkey.extension.vaultBundle.u.u1"], undefined);
    assert.equal(mocks.local["okkey.extension.workspace.current.u.u1"], undefined);
    assert.equal(mocks.local["okkey.vault.deviceUnlock.v1.u.u1"], undefined);
    assert.equal(mocks.local["okkey.vault.devicePrefs.v1.u.u1"], undefined);
    assert.equal(mocks.local["okkey.vault.pinAttempts.v1.u.u1"], undefined);
    assert.equal(Object.keys(mocks.session).length, 0, "session storage must be cleared");
  } finally {
    mocks.restore();
  }
});

test("clearSessionAfterLostDeviceTrust clears session when prior device id exists", async () => {
  const mocks = installStorageMocks({
    local: {},
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: JSON.stringify({
        v: 1,
        user_id: "u1",
        vault_key_b64: "AAAA",
        password_share_c_b64: "BBBB",
        last_activity_at: Date.now(),
        idle_lock_ms: 3_600_000,
      }),
    },
  });
  try {
    await clearSessionAfterLostDeviceTrust(null);
    assert.equal(Object.keys(mocks.session).length, 1, "no prior device → leave session alone");
    await clearSessionAfterLostDeviceTrust("dev-old");
    assert.equal(Object.keys(mocks.session).length, 0, "prior device → clear unlock session");
  } finally {
    mocks.restore();
  }
});

test("readSession wipe on expiry clears unlock session and pending save", async () => {
  const mocks = installStorageMocks({
    local: {
      [STORAGE_KEYS.lastServer]: {
        hostMode: "self-hosted",
        webBaseUrl: "https://vault.example.com",
        updatedAt: 1,
      },
      [STORAGE_KEYS.session]: {
        access_token: "t",
        user_id: "u1",
        expires_at: "2000-01-01T00:00:00Z",
      },
      [STORAGE_KEYS.profile]: {
        webBaseUrl: "https://vault.example.com",
        apiBaseUrl: "https://vault.example.com",
        updatedAt: 1,
      },
      "okkey.extension.vaultBundle.u.u1": { v: 1 },
    },
    session: {
      [UNLOCK_SESSION_STORAGE_KEY]: JSON.stringify({
        v: 1,
        user_id: "u1",
        vault_key_b64: "AAAA",
        password_share_c_b64: "BBBB",
        last_activity_at: Date.now(),
        idle_lock_ms: 3_600_000,
      }),
      [PENDING_SAVE_SESSION_KEY]: {
        "7": { username: "a", password: "secret", captureUrl: "https://ex.test/", websiteUrl: "https://ex.test/", createdAt: Date.now() },
      },
    },
  });

  try {
    const session = await readSession();
    assert.equal(session, null);
    assert.equal(mocks.local[STORAGE_KEYS.session], undefined);
    assert.equal(mocks.local["okkey.extension.vaultBundle.u.u1"], undefined);
    assert.ok(mocks.local[STORAGE_KEYS.lastServer], "lastServer survives expiry wipe");
    assert.equal(Object.keys(mocks.session).length, 0);
  } finally {
    mocks.restore();
  }
});
