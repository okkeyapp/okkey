import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEVICE_PRIVATE_KEY_KEY, DEVICE_PUBLIC_KEY_KEY } from "./storageKeys";

const seed = new Uint8Array(32).fill(7);
const publicKey = new Uint8Array(32).fill(9);
const pair = new Uint8Array(64);
pair.set(seed, 0);
pair.set(publicKey, 32);

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  ed25519Keypair: vi.fn(() => pair.slice()),
  ed25519Sign: vi.fn((_secret: Uint8Array, message: Uint8Array) => {
    const sig = new Uint8Array(64);
    sig.set(message.slice(0, Math.min(32, message.length)), 0);
    return sig;
  }),
  wipeBytes: vi.fn((bytes: Uint8Array) => bytes.fill(0)),
}));

describe("deviceSigningKey", () => {
  const memory = new Map<string, unknown>();

  beforeEach(() => {
    memory.clear();
    vi.resetModules();

    const store: IDBObjectStore = {
      get: (key: IDBValidKey) => {
        const req = {
          result: memory.get(String(key)),
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
        };
        queueMicrotask(() => req.onsuccess?.(new Event("success")));
        return req as unknown as IDBRequest;
      },
      put: (value: { id: string }) => {
        memory.set(value.id, value);
        const req = {
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
        };
        queueMicrotask(() => req.onsuccess?.(new Event("success")));
        return req as unknown as IDBRequest;
      },
      delete: (key: IDBValidKey) => {
        memory.delete(String(key));
        const req = {
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
        };
        queueMicrotask(() => req.onsuccess?.(new Event("success")));
        return req as unknown as IDBRequest;
      },
    } as unknown as IDBObjectStore;

    const fakeDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => store,
      transaction: () => {
        const tx = {
          objectStore: () => store,
          oncomplete: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
          error: null,
        };
        queueMicrotask(() => tx.oncomplete?.(new Event("complete")));
        return tx as unknown as IDBTransaction;
      },
      close: () => undefined,
    };

    vi.stubGlobal("indexedDB", {
      open: () => {
        const req = {
          result: fakeDb,
          onupgradeneeded: null as ((ev: Event) => void) | null,
          onsuccess: null as ((ev: Event) => void) | null,
          onerror: null as ((ev: Event) => void) | null,
        };
        queueMicrotask(() => req.onsuccess?.(new Event("success")));
        return req as unknown as IDBOpenDBRequest;
      },
    });

    const local = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => local.set(key, value),
        removeItem: (key: string) => local.delete(key),
      },
    });
    (globalThis as { __local?: Map<string, string> }).__local = local;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mints a durable seed in IndexedDB and can sign without reminting", async () => {
    const mod = await import("./deviceSigningKey");
    const pub = await mod.ensureDeviceSigningPublicKey();
    expect(pub.length).toBeGreaterThan(10);
    expect(await mod.hasDeviceSigningKey()).toBe(true);
    const sig = await mod.signDeviceBindChallenge(new TextEncoder().encode("hello"));
    expect(sig.byteLength).toBe(64);
    const local = (globalThis as { __local?: Map<string, string> }).__local!;
    expect(local.get(DEVICE_PRIVATE_KEY_KEY)).toBeUndefined();
    const stored = memory.get("current") as { seed?: ArrayBuffer };
    expect(stored.seed?.byteLength).toBe(32);
  });

  it("does not mint a new key when signing without stored material", async () => {
    const mod = await import("./deviceSigningKey");
    await expect(mod.signDeviceBindChallenge(new TextEncoder().encode("hello"))).rejects.toThrow(
      /device private key is missing/i,
    );
  });

  it("migrates legacy localStorage seed into IndexedDB and clears it", async () => {
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const local = (globalThis as { __local?: Map<string, string> }).__local!;
    local.set(DEVICE_PRIVATE_KEY_KEY, b64(seed));
    local.set(DEVICE_PUBLIC_KEY_KEY, b64(publicKey));

    const mod = await import("./deviceSigningKey");
    const pub = await mod.ensureDeviceSigningPublicKey();
    expect(pub).toBe(b64(publicKey));
    expect(local.get(DEVICE_PRIVATE_KEY_KEY)).toBeUndefined();
    expect(local.get(DEVICE_PUBLIC_KEY_KEY)).toBeUndefined();
    await mod.clearDeviceSigningKey();
    expect(await mod.hasDeviceSigningKey()).toBe(false);
  });
});
