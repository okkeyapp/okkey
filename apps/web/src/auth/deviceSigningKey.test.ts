import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEVICE_PRIVATE_KEY_KEY, DEVICE_PUBLIC_KEY_KEY } from "./storageKeys";

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

  it("mints a non-extractable key and can sign", async () => {
    const mod = await import("./deviceSigningKey");
    const pub = await mod.ensureDeviceSigningPublicKey();
    expect(pub.length).toBeGreaterThan(10);
    expect(await mod.hasDeviceSigningKey()).toBe(true);
    const sig = await mod.signDeviceBindChallenge(new TextEncoder().encode("hello"));
    expect(sig.byteLength).toBe(64);
    const local = (globalThis as { __local?: Map<string, string> }).__local!;
    expect(local.get(DEVICE_PRIVATE_KEY_KEY)).toBeUndefined();
  });

  it("migrates legacy localStorage seed into IndexedDB and clears it", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const b64 = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes));
    const b64urlToBytes = (value: string) => {
      const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
      const b64std = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
      return Uint8Array.from(atob(b64std), (c) => c.charCodeAt(0));
    };
    const local = (globalThis as { __local?: Map<string, string> }).__local!;
    local.set(DEVICE_PRIVATE_KEY_KEY, b64(b64urlToBytes(jwk.d!)));
    local.set(DEVICE_PUBLIC_KEY_KEY, b64(rawPub));

    const mod = await import("./deviceSigningKey");
    const pub = await mod.ensureDeviceSigningPublicKey();
    expect(pub).toBe(b64(rawPub));
    expect(local.get(DEVICE_PRIVATE_KEY_KEY)).toBeUndefined();
    expect(local.get(DEVICE_PUBLIC_KEY_KEY)).toBeUndefined();
    await mod.clearDeviceSigningKey();
    expect(await mod.hasDeviceSigningKey()).toBe(false);
  });
});
