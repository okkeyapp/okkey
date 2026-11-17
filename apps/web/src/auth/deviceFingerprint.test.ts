import { describe, expect, it, vi } from "vitest";

vi.mock("./browserEnvironment", async () => {
  const actual = await vi.importActual<typeof import("./browserEnvironment")>("./browserEnvironment");
  return actual;
});

import { getOrCreateDeviceFingerprint } from "./deviceFingerprint";
import {
  DEVICE_FINGERPRINT_KEY,
  VAULT_BUNDLE_STORAGE_KEY,
  vaultBundleScopedStorageKey,
} from "./storageKeys";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const COARSE = "web_app-chrome-macos-10.15.7";

function memoryStorage(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    snapshot: () => store,
  };
}

describe("getOrCreateDeviceFingerprint", () => {
  it("gives a new profile a stable install id under the user-agent prefix", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC });
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);

    const first = getOrCreateDeviceFingerprint();
    const second = getOrCreateDeviceFingerprint();
    expect(first).toBe(second);
    expect(first.startsWith(`${COARSE}.`)).toBe(true);
    expect(first).toMatch(/\.([a-f0-9]{16})$/);
    expect(storage.snapshot().get(DEVICE_FINGERPRINT_KEY)).toBe(first);
  });

  it("keeps two empty profiles from sharing one fingerprint", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC });
    const firstStorage = memoryStorage();
    vi.stubGlobal("localStorage", firstStorage);
    const first = getOrCreateDeviceFingerprint();

    const secondStorage = memoryStorage();
    vi.stubGlobal("localStorage", secondStorage);
    const second = getOrCreateDeviceFingerprint();

    expect(first).not.toBe(second);
    expect(second.startsWith(`${COARSE}.`)).toBe(true);
  });

  it("keeps the unsuffixed id for a profile that already registered this browser", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC });
    const storage = memoryStorage({
      [DEVICE_FINGERPRINT_KEY]: COARSE,
      [vaultBundleScopedStorageKey("user-1")]: "{\"device_share_b64\":\"abc\"}",
    });
    vi.stubGlobal("localStorage", storage);

    expect(getOrCreateDeviceFingerprint()).toBe(COARSE);
    expect(storage.snapshot().get(DEVICE_FINGERPRINT_KEY)).toBe(COARSE);
  });

  it("replaces a cached unsuffixed id when this profile has no device material", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC });
    const storage = memoryStorage({
      [DEVICE_FINGERPRINT_KEY]: COARSE,
    });
    vi.stubGlobal("localStorage", storage);

    const created = getOrCreateDeviceFingerprint();
    expect(created.startsWith(`${COARSE}.`)).toBe(true);
    expect(created).not.toBe(COARSE);
    expect(storage.snapshot().get(VAULT_BUNDLE_STORAGE_KEY)).toBeUndefined();
  });

  it("restores the unsuffixed id when the cache was cleared but the vault remains", () => {
    vi.stubGlobal("navigator", { userAgent: CHROME_MAC });
    const storage = memoryStorage({
      [VAULT_BUNDLE_STORAGE_KEY]: "{\"device_share_b64\":\"abc\"}",
    });
    vi.stubGlobal("localStorage", storage);

    expect(getOrCreateDeviceFingerprint()).toBe(COARSE);
    expect(storage.snapshot().get(DEVICE_FINGERPRINT_KEY)).toBe(COARSE);
  });
});
