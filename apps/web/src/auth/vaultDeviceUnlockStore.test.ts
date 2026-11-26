import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadBioUnlockWrap,
  readBioUnlockWrap,
  writeBioUnlockWrap,
  type StoredBioUnlock,
} from "./vaultDeviceUnlockStore";

const USER = "user-bio-store";
const STORE_KEY = `okkey.vault.deviceUnlock.v1.u.${USER}`;

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

describe("vaultDeviceUnlockStore biometric records", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists PRF salt records without wrap key fields", () => {
    const wrap: StoredBioUnlock = {
      credentialIdB64: "cred",
      ciphertextB64: "cipher",
      prfSaltB64: "salt",
    };
    writeBioUnlockWrap(USER, wrap);
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as {
      bio: Record<string, unknown>;
    };
    expect(raw.bio).toEqual(wrap);
    expect(Object.keys(raw.bio).sort()).toEqual([
      "ciphertextB64",
      "credentialIdB64",
      "prfSaltB64",
    ]);
    expect(raw.bio).not.toHaveProperty("wrapKeyB64");
    expect(readBioUnlockWrap(USER)).toEqual(wrap);
  });

  it("wipes legacy wrapKeyB64 records on load and disables reuse", () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        pin: null,
        bio: {
          credentialIdB64: "cred",
          ciphertextB64: "cipher",
          wrapKeyB64: "legacy-secret-key-material",
        },
      }),
    );
    const loaded = loadBioUnlockWrap(USER);
    expect(loaded.wrap).toBeNull();
    expect(loaded.wipedLegacyBio).toBe(true);
    expect(readBioUnlockWrap(USER)).toBeNull();

    const persisted = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as {
      bio: unknown;
    };
    expect(persisted.bio).toBeNull();
    expect(JSON.stringify(persisted)).not.toContain("wrapKeyB64");
    expect(JSON.stringify(persisted)).not.toContain("legacy-secret-key-material");
  });

  it("rejects records that still carry key-material field names", () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        pin: null,
        bio: {
          credentialIdB64: "cred",
          ciphertextB64: "cipher",
          prfSaltB64: "salt",
          wrapKeyB64: "",
          secretKey: "x",
        },
      }),
    );
    expect(readBioUnlockWrap(USER)).toBeNull();
  });
});
