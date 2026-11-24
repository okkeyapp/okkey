import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  clearExtensionServerKeyShareMemory,
  ensureExtensionVaultBundle,
} from "./extensionVaultBundle.ts";

const USER_ID = "user-1";
const BUNDLE_KEY = `okkey.extension.vaultBundle.u.${USER_ID}`;
const FINGERPRINT_KEY = "okkey.extension.deviceFingerprint";

const encrypted = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: "cGF5bG9hZA",
  meta: {},
};

type StorageArea = {
  get: (keys?: string | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function installBrowser(store: Record<string, unknown>): () => void {
  const g = globalThis as { browser?: { storage?: { local?: StorageArea } } };
  const previous = g.browser;
  const local: StorageArea = {
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
  g.browser = { storage: { local } };
  return () => {
    g.browser = previous;
  };
}

beforeEach(() => {
  clearExtensionServerKeyShareMemory();
});

afterEach(() => {
  clearExtensionServerKeyShareMemory();
});

test("extension vault storage does not keep the server share after a fetch", async () => {
  const store: Record<string, unknown> = {
    [FINGERPRINT_KEY]: "fp-1",
    [BUNDLE_KEY]: {
      server_key_share_b64: "bGVnYWN5",
      device_share_b64: "ZGV2aWNl",
      password_kdf_salt_b64: "c2FsdA",
      password_kdf_params_version: 2,
      encrypted_private_key: encrypted,
    },
  };
  const restore = installBrowser(store);
  try {
    const bundle = await ensureExtensionVaultBundle({
      userId: USER_ID,
      core: {
        async getVaultUnlockBootstrap() {
          return {
            server_key_share: "c2VydmVy",
            device_share: "ZGV2aWNl",
            password_kdf_salt: "c2FsdA",
            password_kdf_params_version: 2,
            encrypted_private_key: encrypted,
          };
        },
      } as never,
    });
    assert.equal(bundle?.server_key_share_b64, "c2VydmVy");
    assert.equal(JSON.stringify(store[BUNDLE_KEY]).includes("server_key_share"), false);
    assert.equal(JSON.stringify(store[BUNDLE_KEY]).includes("ZGV2aWNl"), true);
  } finally {
    restore();
  }
});

test("offline extension unlock keeps a legacy server share on disk", async () => {
  const legacy = {
    server_key_share_b64: "bGVnYWN5",
    device_share_b64: "ZGV2aWNl",
    password_kdf_salt_b64: "c2FsdA",
    password_kdf_params_version: 2,
    encrypted_private_key: encrypted,
  };
  const store: Record<string, unknown> = {
    [FINGERPRINT_KEY]: "fp-1",
    [BUNDLE_KEY]: legacy,
  };
  const restore = installBrowser(store);
  try {
    const bundle = await ensureExtensionVaultBundle({
      userId: USER_ID,
      core: {
        async getVaultUnlockBootstrap() {
          throw new Error("offline");
        },
      } as never,
    });
    assert.equal(bundle?.server_key_share_b64, "bGVnYWN5");
    const persisted = store[BUNDLE_KEY] as { server_key_share_b64?: string };
    assert.equal(persisted.server_key_share_b64, "bGVnYWN5");
  } finally {
    restore();
  }
});

test("a cleared server share keeps the local share and uploads an envelope", async () => {
  const localShare = Buffer.alloc(32, 4).toString("base64");
  const uploaded = Buffer.alloc(32, 9).toString("base64");
  const store: Record<string, unknown> = {
    [FINGERPRINT_KEY]: "fp-1",
    [BUNDLE_KEY]: {
      device_share_b64: localShare,
      password_kdf_salt_b64: "c2FsdA",
      password_kdf_params_version: 2,
      encrypted_private_key: encrypted,
    },
  };
  const restore = installBrowser(store);
  let seen: string | null = null;
  try {
    const bundle = await ensureExtensionVaultBundle({
      userId: USER_ID,
      core: {
        async getVaultUnlockBootstrap() {
          return {
            server_key_share: "c2VydmVy",
            device_share: "",
            password_kdf_salt: "c2FsdA",
            password_kdf_params_version: 2,
            encrypted_private_key: encrypted,
          };
        },
      } as never,
      rewriteClearedDeviceShare: async (localShareB64) => {
        seen = localShareB64;
        return uploaded;
      },
    });
    assert.equal(seen, localShare);
    assert.equal(bundle?.device_share_b64, uploaded);
    assert.equal(bundle?.server_key_share_b64, "c2VydmVy");
    const persisted = store[BUNDLE_KEY] as { device_share_b64?: string; server_key_share_b64?: string };
    assert.equal(persisted.device_share_b64, uploaded);
    assert.equal(persisted.server_key_share_b64, undefined);
  } finally {
    restore();
  }
});

test("a migrated extension bundle cannot unlock offline with the master password", async () => {
  const store: Record<string, unknown> = {
    [FINGERPRINT_KEY]: "fp-1",
    [BUNDLE_KEY]: {
      device_share_b64: "ZGV2aWNl",
      password_kdf_salt_b64: "c2FsdA",
      password_kdf_params_version: 2,
      encrypted_private_key: encrypted,
    },
  };
  const restore = installBrowser(store);
  try {
    const bundle = await ensureExtensionVaultBundle({
      userId: USER_ID,
      core: {
        async getVaultUnlockBootstrap() {
          throw new Error("offline");
        },
      } as never,
    });
    assert.equal(bundle?.device_share_b64, "ZGV2aWNl");
    assert.equal(bundle?.server_key_share_b64, undefined);
  } finally {
    restore();
  }
});
