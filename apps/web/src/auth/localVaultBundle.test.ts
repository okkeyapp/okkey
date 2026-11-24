import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finalizePendingVaultBundle,
  readVaultBundle,
  writeVaultBundle,
  type StoredVaultBundle,
} from "./localVaultBundle";
import { VAULT_BUNDLE_PENDING_KEY, VAULT_BUNDLE_STORAGE_KEY, vaultBundleScopedStorageKey } from "./storageKeys";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
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

function installMemoryStorage(): void {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
}

const userId = "1156820912149601";

const encrypted = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: "cGF5bG9hZA",
  meta: {},
};

function bundle(serverShare?: string): StoredVaultBundle {
  return {
    ...(serverShare ? { server_key_share_b64: serverShare } : {}),
    device_share_b64: "ZGV2aWNl",
    password_kdf_salt_b64: "c2FsdA",
    password_kdf_params_version: 2,
    encrypted_private_key: encrypted,
  };
}

describe("localVaultBundle server share", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not persist the server share in localStorage or the session mirror", () => {
    writeVaultBundle(bundle("c2VydmVy"), userId);
    const scoped = localStorage.getItem(vaultBundleScopedStorageKey(userId)) ?? "";
    const session = sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY) ?? "";
    expect(scoped.includes("server_key_share")).toBe(false);
    expect(session.includes("server_key_share")).toBe(false);
    expect(scoped.includes("ZGV2aWNl")).toBe(true);
    const read = readVaultBundle(userId);
    expect(read?.device_share_b64).toBe("ZGV2aWNl");
    expect(read?.server_key_share_b64).toBeUndefined();
    expect(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY)?.includes("server_key_share")).toBe(false);
  });

  it("still reads a legacy server share and strips it from the session mirror", () => {
    const legacy = JSON.stringify(bundle("bGVnYWN5"));
    localStorage.setItem(vaultBundleScopedStorageKey(userId), legacy);
    const read = readVaultBundle(userId);
    expect(read?.server_key_share_b64).toBe("bGVnYWN5");
    expect(localStorage.getItem(vaultBundleScopedStorageKey(userId))).toBe(legacy);
    expect(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY)?.includes("server_key_share")).toBe(false);
  });

  it("removes a legacy server share on the next write", () => {
    localStorage.setItem(vaultBundleScopedStorageKey(userId), JSON.stringify(bundle("bGVnYWN5")));
    const current = readVaultBundle(userId);
    expect(current).not.toBeNull();
    writeVaultBundle(current!, userId);
    const stored = localStorage.getItem(vaultBundleScopedStorageKey(userId)) ?? "";
    expect(stored.includes("server_key_share")).toBe(false);
    expect(stored.includes("ZGV2aWNl")).toBe(true);
  });

  it("strips the server share when finalizing a pending registration bundle", () => {
    localStorage.setItem(VAULT_BUNDLE_PENDING_KEY, JSON.stringify(bundle("cGVuZGluZw")));
    finalizePendingVaultBundle(userId);
    const stored = localStorage.getItem(vaultBundleScopedStorageKey(userId)) ?? "";
    expect(localStorage.getItem(VAULT_BUNDLE_PENDING_KEY)).toBeNull();
    expect(stored.includes("server_key_share")).toBe(false);
    expect(stored.includes("ZGV2aWNl")).toBe(true);
  });
});
