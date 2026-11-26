import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VAULT_UNLOCK_TAB_KEY } from "./storageKeys";
import {
  LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS,
  clearVaultUnlockSession,
  purgeLegacyVaultUnlockWebStorage,
  readInitialTabVaultSession,
  vaultIdleExceeded,
} from "./vaultUnlockSessionStorage";

const userId = "1156820912149601";

/** Forbidden cleartext unlock fields that must never appear in Web Storage. */
const FORBIDDEN_SECRET_MARKERS = ["vault_key_b64", "password_share_c_b64"] as const;

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
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function installMemoryStorage(): void {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
}

function randomBase64Key(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const byte of bytes) {
    bin += String.fromCharCode(byte);
  }
  return btoa(bin);
}

function seedLegacyUnlockRecord(storage: Storage, key: string): void {
  storage.setItem(
    key,
    JSON.stringify({
      v: 1,
      user_id: userId,
      vault_key_b64: randomBase64Key(),
      password_share_c_b64: randomBase64Key(),
      last_activity_at: Date.now(),
    }),
  );
}

function webStorageContainsForbiddenSecrets(): boolean {
  const bags: Array<Storage | undefined> = [
    typeof sessionStorage !== "undefined" ? sessionStorage : undefined,
    typeof localStorage !== "undefined" ? localStorage : undefined,
  ];
  for (const storage of bags) {
    if (!storage) continue;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key) ?? "";
      for (const marker of FORBIDDEN_SECRET_MARKERS) {
        if (key.includes(marker) || value.includes(marker)) {
          return true;
        }
      }
    }
  }
  return false;
}

describe("vaultUnlockSessionStorage (memory-only unlock)", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("purges legacy unlock records from sessionStorage and localStorage", () => {
    for (const key of LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS) {
      seedLegacyUnlockRecord(sessionStorage, key);
      seedLegacyUnlockRecord(localStorage, key);
    }
    expect(webStorageContainsForbiddenSecrets()).toBe(true);

    purgeLegacyVaultUnlockWebStorage();

    for (const key of LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS) {
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(webStorageContainsForbiddenSecrets()).toBe(false);
  });

  it("clearVaultUnlockSession removes leftover unlock keys", () => {
    seedLegacyUnlockRecord(sessionStorage, VAULT_UNLOCK_TAB_KEY);
    clearVaultUnlockSession();
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
    expect(webStorageContainsForbiddenSecrets()).toBe(false);
  });

  it("readInitialTabVaultSession always returns locked and clears leftovers", () => {
    seedLegacyUnlockRecord(sessionStorage, VAULT_UNLOCK_TAB_KEY);
    const init = readInitialTabVaultSession(userId);
    expect(init.unlocked).toBe(false);
    expect(init.vaultKey).toBeNull();
    expect(init.passwordShareC).toBeNull();
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
    expect(webStorageContainsForbiddenSecrets()).toBe(false);
  });

  it("does not write vault secrets to sessionStorage or localStorage", () => {
    const sessionSet = vi.fn(sessionStorage.setItem.bind(sessionStorage));
    const localSet = vi.fn(localStorage.setItem.bind(localStorage));
    sessionStorage.setItem = sessionSet;
    localStorage.setItem = localSet;

    clearVaultUnlockSession();
    readInitialTabVaultSession(userId);
    purgeLegacyVaultUnlockWebStorage();

    for (const call of [...sessionSet.mock.calls, ...localSet.mock.calls]) {
      const key = String(call[0] ?? "");
      const value = String(call[1] ?? "");
      for (const marker of FORBIDDEN_SECRET_MARKERS) {
        expect(key.includes(marker)).toBe(false);
        expect(value.includes(marker)).toBe(false);
      }
      expect(
        LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS.includes(
          key as (typeof LEGACY_VAULT_UNLOCK_WEB_STORAGE_KEYS)[number],
        ),
      ).toBe(false);
    }
    expect(webStorageContainsForbiddenSecrets()).toBe(false);
  });

  it("vaultIdleExceeded drives in-memory idle lock without Web Storage", () => {
    const started = Date.parse("2026-01-01T12:00:00Z");
    expect(vaultIdleExceeded(started, 15 * 60 * 1000, started + 14 * 60 * 1000)).toBe(false);
    expect(vaultIdleExceeded(started, 15 * 60 * 1000, started + 15 * 60 * 1000)).toBe(true);
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
    expect(localStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
  });
});
