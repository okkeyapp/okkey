import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { finalizePendingVaultBundle, writeVaultBundle, type StoredVaultBundle } from "./localVaultBundle";
import { VAULT_BUNDLE_PENDING_KEY, VAULT_BUNDLE_STORAGE_KEY, vaultBundleScopedStorageKey } from "./storageKeys";
import { readVaultDevicePrefs, writeVaultDevicePrefs } from "./vaultDevicePrefs";

const USER = "user-sleep-lock";
const PREFS_KEY = `okkey.vault.devicePrefs.v1.u.${USER}`;
const MIGRATION_KEY = `okkey.vault.devicePrefs.lockOnSleepMigration.v1.u.${USER}`;

function memoryStorage() {
  const store = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const bundle: StoredVaultBundle = {
  device_share_b64: "ZGV2aWNl",
  password_kdf_salt_b64: "c2FsdA",
  password_kdf_params_version: 2,
  encrypted_private_key: {
    crypto_version: 2,
    algorithm: "opaque",
    payload: "cGF5bG9hZA",
    meta: {},
  },
};

describe("readVaultDevicePrefs lock on device sleep", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("window", { dispatchEvent: () => true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses false for a fresh user and records the migration marker once", () => {
    const storage = localStorage as ReturnType<typeof memoryStorage>;
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(false);
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
    expect(localStorage.getItem(MIGRATION_KEY)).toBe("1");

    const writes = storage.writes.length;
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(false);
    expect(storage.writes.length).toBe(writes);
  });

  it("preserves a saved lockOnDeviceSleep value", () => {
    writeVaultDevicePrefs(USER, {
      lockOnDeviceSleep: false,
      lockOnPopupClose: false,
      clipboardClearSeconds: 15,
      requireReauthZones: [],
      pinEnabled: false,
      biometricEnabled: false,
    });
    localStorage.setItem(vaultBundleScopedStorageKey(USER), "{}");
    const storage = localStorage as ReturnType<typeof memoryStorage>;
    const writes = storage.writes.length;
    const prefs = readVaultDevicePrefs(USER);
    expect(prefs.lockOnDeviceSleep).toBe(false);
    expect(prefs.clipboardClearSeconds).toBe(15);
    expect(storage.writes.length).toBe(writes);

    writeVaultDevicePrefs(USER, { ...prefs, lockOnDeviceSleep: true });
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(true);
  });

  it("persists true once when a local vault bundle already exists", () => {
    localStorage.setItem(vaultBundleScopedStorageKey(USER), JSON.stringify(bundle));
    const storage = localStorage as ReturnType<typeof memoryStorage>;
    storage.writes.length = 0;

    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(true);
    expect(localStorage.getItem(PREFS_KEY)).toContain('"lockOnDeviceSleep":true');
    expect(localStorage.getItem(MIGRATION_KEY)).toBe("1");

    const writes = storage.writes.length;
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(true);
    expect(storage.writes.length).toBe(writes);

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { lockOnDeviceSleep: boolean };
    stored.lockOnDeviceSleep = false;
    localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
    const afterEdit = storage.writes.length;
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(false);
    expect(storage.writes.length).toBe(afterEdit);
  });

  it("treats a legacy unscoped vault bundle as prior state", () => {
    localStorage.setItem(VAULT_BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(true);
    expect(localStorage.getItem(PREFS_KEY)).toContain('"lockOnDeviceSleep":true');
  });

  it("keeps the new default after a vault bundle is created for a new user", () => {
    writeVaultBundle(bundle, USER);
    expect(localStorage.getItem(vaultBundleScopedStorageKey(USER))).toBeTruthy();
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(false);
    expect(localStorage.getItem(PREFS_KEY)).toBeNull();
  });

  it("keeps the new default after registration finalizes a pending bundle", () => {
    localStorage.setItem(VAULT_BUNDLE_PENDING_KEY, JSON.stringify(bundle));
    finalizePendingVaultBundle(USER);
    expect(localStorage.getItem(vaultBundleScopedStorageKey(USER))).toBeTruthy();
    expect(readVaultDevicePrefs(USER).lockOnDeviceSleep).toBe(false);
  });
});
