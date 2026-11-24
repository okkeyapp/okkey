import test from "node:test";
import assert from "node:assert/strict";

import { claimExtensionShareDelivery, prepareExtensionShareDelivery } from "./deviceShareDelivery.ts";
import { registerExtensionDevice } from "./deviceTrust.ts";
import { STORAGE_KEYS } from "./storage.ts";

type Store = Record<string, unknown>;

function installLocalStorage(store: Store): () => void {
  const g = globalThis as {
    browser?: { storage?: { local?: unknown }; runtime?: { sendMessage?: () => Promise<void> } };
  };
  const prev = g.browser;
  g.browser = {
    storage: {
      local: {
        async get(keys?: string) {
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          return { ...store };
        },
        async set(items: Store) {
          Object.assign(store, items);
        },
        async remove(keys: string | string[]) {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            delete store[key];
          }
        },
      },
    },
    runtime: { async sendMessage() {} },
  };
  return () => {
    g.browser = prev;
  };
}

test("extension register publishes a one-time delivery key", async () => {
  const store: Store = {};
  const restore = installLocalStorage(store);
  try {
    let body: Record<string, unknown> | undefined;
    const result = await registerExtensionDevice(
      {
        async registerDevice(input) {
          body = input as unknown as Record<string, unknown>;
          return { device_id: "dev-1", status: "pending_approval" as const };
        },
      } as never,
      {
        initCrypto: async () => undefined,
        signingPublicKey: async () => "cHVi",
        prepareShareDelivery: async () => ({
          x25519PublicB64: "eHh4",
          mlkemPublicB64: "bWxr",
        }),
      },
    );
    assert.equal(result.device_id, "dev-1");
    assert.equal(body?.one_time_x25519_public_key, "eHh4");
    assert.equal(body?.one_time_mlkem_public_key, "bWxr");
  } finally {
    restore();
  }
});

test("extension claims a hybrid share delivery and deletes the one-time key", async () => {
  const store: Store = {
    [STORAGE_KEYS.deviceFingerprint]: "fp-1",
  };
  const restore = installLocalStorage(store);
  try {
    const pair = await prepareExtensionShareDelivery(
      "fp-1",
      async () => ({
        x25519PrivateKey: new Uint8Array([1, 2, 3, 4]),
        x25519PublicKey: new Uint8Array([5, 6, 7, 8]),
        mlkemPrivateKey: new Uint8Array([9, 9]),
        mlkemPublicKey: new Uint8Array([8, 8]),
      }),
      async () => undefined,
    );
    assert.ok(pair);
    assert.equal(typeof store[STORAGE_KEYS.shareDeliveryKey], "object");

    const share = new Uint8Array(32).fill(3);
    const rawShareB64 = btoa(String.fromCharCode(...share));
    let confirmed: string | undefined;
    const trusted = await claimExtensionShareDelivery(
      {
        async getDeviceShareDelivery() {
          return { share_delivery_envelope: "YQ==", expires_at: "2099-01-01T00:00:00.000Z" };
        },
        async confirmDeviceShareDelivery(_deviceId: string, deviceShareB64: string) {
          confirmed = deviceShareB64;
          return { device_id: "dev-1", status: "trusted" as const };
        },
      } as never,
      "fp-1",
      "dev-1",
      async () => share,
      async () => undefined,
      "user-1",
      async () => "hybrid-envelope",
    );
    assert.equal(trusted, true);
    assert.equal(confirmed, "hybrid-envelope");
    assert.notEqual(confirmed, rawShareB64);
    assert.equal(store[STORAGE_KEYS.shareDeliveryKey], undefined);
  } finally {
    restore();
  }
});
