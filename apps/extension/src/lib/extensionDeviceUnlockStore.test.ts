import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  loadExtensionBioUnlockWrap,
  readExtensionBioUnlockWrap,
  writeExtensionBioUnlockWrap,
} from "./extensionDeviceUnlockStore.ts";

const USER = "ext-bio-user";
const STORE_KEY = `okkey.vault.deviceUnlock.v1.u.${USER}`;

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

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

test("extension bio store persists PRF salt without wrap key fields", async () => {
  const store: Record<string, unknown> = {};
  restore = installBrowser(store);
  await writeExtensionBioUnlockWrap(USER, {
    credentialIdB64: "cred",
    ciphertextB64: "cipher",
    prfSaltB64: "salt",
  });
  const raw = JSON.parse(String(store[STORE_KEY])) as { bio: Record<string, unknown> };
  assert.deepEqual(Object.keys(raw.bio).sort(), [
    "ciphertextB64",
    "credentialIdB64",
    "prfSaltB64",
  ]);
  assert.equal("wrapKeyB64" in raw.bio, false);
  const loaded = await readExtensionBioUnlockWrap(USER);
  assert.deepEqual(loaded, {
    credentialIdB64: "cred",
    ciphertextB64: "cipher",
    prfSaltB64: "salt",
  });
});

test("extension bio store wipes legacy wrapKeyB64 on load", async () => {
  const store: Record<string, unknown> = {
    [STORE_KEY]: JSON.stringify({
      pin: null,
      bio: {
        credentialIdB64: "cred",
        ciphertextB64: "cipher",
        wrapKeyB64: "legacy-secret-key-material",
      },
    }),
  };
  restore = installBrowser(store);
  const loaded = await loadExtensionBioUnlockWrap(USER);
  assert.equal(loaded.wrap, null);
  assert.equal(loaded.wipedLegacyBio, true);
  assert.equal(await readExtensionBioUnlockWrap(USER), null);
  const persisted = JSON.parse(String(store[STORE_KEY])) as { bio: unknown };
  assert.equal(persisted.bio, null);
  assert.equal(JSON.stringify(persisted).includes("wrapKeyB64"), false);
  assert.equal(JSON.stringify(persisted).includes("legacy-secret-key-material"), false);
});
