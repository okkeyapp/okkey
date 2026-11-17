import assert from "node:assert/strict";
import test from "node:test";

import {
  lockOnSleepMigrationMarkerValue,
  vaultDevicePrefsKey,
  vaultLockOnSleepMigrationKey,
} from "@okkey/vault/vault-device-prefs";

import { readExtensionDevicePrefs } from "./extensionVaultSession.ts";
import { extensionVaultBundleStorageKey, writeExtensionVaultBundle } from "./vaultStorage.ts";

const USER = "user-ext";

type Area = {
  get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function installLocalStorage(): { store: Record<string, unknown>; writes: string[] } {
  const store: Record<string, unknown> = {};
  const writes: string[] = [];
  const area: Area = {
    async get(keys) {
      if (typeof keys === "string") {
        return { [keys]: store[keys] };
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) out[key] = store[key];
        return out;
      }
      return { ...store };
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store[key] = value;
        writes.push(key);
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete store[key];
    },
  };
  const g = globalThis as { chrome?: { storage?: { local?: Area } } };
  g.chrome = { storage: { local: area } };
  return { store, writes };
}

function clearChrome(): void {
  const g = globalThis as { chrome?: unknown };
  delete g.chrome;
}

const bundle = {
  device_share_b64: "ZGV2aWNl",
  password_kdf_salt_b64: "c2FsdA",
  password_kdf_params_version: 2,
  encrypted_private_key: {
    crypto_version: 2 as const,
    algorithm: "opaque",
    payload: "cGF5bG9hZA",
    meta: {},
  },
};

test("extension fresh user defaults lockOnDeviceSleep to false", async () => {
  const { store } = installLocalStorage();
  try {
    const prefs = await readExtensionDevicePrefs(USER);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(store[vaultDevicePrefsKey(USER)], undefined);
    assert.equal(store[vaultLockOnSleepMigrationKey(USER)], lockOnSleepMigrationMarkerValue());
  } finally {
    clearChrome();
  }
});

test("extension preserves a saved lockOnDeviceSleep value", async () => {
  const { store, writes } = installLocalStorage();
  try {
    store[vaultDevicePrefsKey(USER)] = JSON.stringify({
      lockOnDeviceSleep: false,
      clipboardClearSeconds: 20,
    });
    store[extensionVaultBundleStorageKey(USER)] = { v: 1 };
    const before = writes.length;
    const prefs = await readExtensionDevicePrefs(USER);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(prefs.clipboardClearSeconds, 20);
    assert.equal(writes.length, before);
  } finally {
    clearChrome();
  }
});

test("extension migrates an existing vault bundle to lockOnDeviceSleep true once", async () => {
  const { store, writes } = installLocalStorage();
  try {
    store[extensionVaultBundleStorageKey(USER)] = { device_share_b64: "ZGV2aWNl" };
    const prefs = await readExtensionDevicePrefs(USER);
    assert.equal(prefs.lockOnDeviceSleep, true);
    assert.match(String(store[vaultDevicePrefsKey(USER)]), /"lockOnDeviceSleep":true/);
    assert.equal(store[vaultLockOnSleepMigrationKey(USER)], "1");

    const before = writes.length;
    const again = await readExtensionDevicePrefs(USER);
    assert.equal(again.lockOnDeviceSleep, true);
    assert.equal(writes.length, before);

    store[vaultDevicePrefsKey(USER)] = JSON.stringify({ lockOnDeviceSleep: false });
    const edited = await readExtensionDevicePrefs(USER);
    assert.equal(edited.lockOnDeviceSleep, false);
    assert.equal(writes.length, before);
  } finally {
    clearChrome();
  }
});

test("extension bundle created by this version keeps the new default", async () => {
  const { store } = installLocalStorage();
  try {
    await writeExtensionVaultBundle(USER, bundle);
    assert.ok(store[extensionVaultBundleStorageKey(USER)]);
    const prefs = await readExtensionDevicePrefs(USER);
    assert.equal(prefs.lockOnDeviceSleep, false);
    assert.equal(store[vaultDevicePrefsKey(USER)], undefined);
    assert.equal(store[vaultLockOnSleepMigrationKey(USER)], "1");
  } finally {
    clearChrome();
  }
});
