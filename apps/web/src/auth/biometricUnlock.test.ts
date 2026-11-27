import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wipeBytes = vi.hoisted(() =>
  vi.fn((bytes: Uint8Array | null | undefined) => {
    if (bytes) {
      bytes.fill(0);
    }
  }),
);
const deriveBioWrapKeyFromPrf = vi.hoisted(() =>
  vi.fn(async () => new Uint8Array(32).fill(9)),
);
const generateBioPrfSalt = vi.hoisted(() =>
  vi.fn(async () => new Uint8Array(32).fill(3)),
);
const wrapUnlockMaterialWithBioKey = vi.hoisted(() =>
  vi.fn(async () => "cipher-b64"),
);
const unwrapUnlockMaterialWithBioKey = vi.hoisted(() =>
  vi.fn(async () => ({
    vaultKey: new Uint8Array(32).fill(1),
    passwordShareC: new Uint8Array(32).fill(2),
  })),
);

vi.mock("@okkey/crypto", () => ({
  deriveBioWrapKeyFromPrf,
  generateBioPrfSalt,
  wrapUnlockMaterialWithBioKey,
  unwrapUnlockMaterialWithBioKey,
  wipeBytes,
}));

import {
  biometricErrorMessageKey,
  mapWebAuthnError,
  readPrfFirst,
  setupBiometricUnlock,
  tryUnlockWithBiometrics,
} from "./biometricUnlock";
import { readBioUnlockWrap, writeBioUnlockWrap } from "./vaultDeviceUnlockStore";

const USER = "user-bio";
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

function stubPlatformAuthenticator(available = true) {
  vi.stubGlobal("PublicKeyCredential", {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn(async () => available),
  });
}

function stubSecureWindow(hostname = "app.okkey.test") {
  vi.stubGlobal("window", {
    isSecureContext: true,
    location: { hostname },
    PublicKeyCredential: globalThis.PublicKeyCredential,
  });
  vi.stubGlobal("isSecureContext", true);
}

describe("mapWebAuthnError", () => {
  it("maps common DOMException names", () => {
    expect(mapWebAuthnError(new DOMException("x", "NotAllowedError"))).toBe("cancelled");
    expect(mapWebAuthnError(new DOMException("x", "AbortError"))).toBe("cancelled");
    expect(mapWebAuthnError(new DOMException("x", "TimeoutError"))).toBe("timeout");
    expect(mapWebAuthnError(new DOMException("x", "SecurityError"))).toBe("security");
    expect(mapWebAuthnError(new DOMException("x", "InvalidStateError"))).toBe("invalid_state");
    expect(mapWebAuthnError(new DOMException("x", "NotSupportedError"))).toBe("unsupported");
  });

  it("falls back to failed", () => {
    expect(mapWebAuthnError(new Error("boom"))).toBe("failed");
    expect(mapWebAuthnError(null)).toBe("failed");
  });
});

describe("biometricErrorMessageKey", () => {
  it("returns stable i18n keys", () => {
    expect(biometricErrorMessageKey("unavailable")).toBe(
      "web.settingsPopup.vault.biometric.error.unavailable",
    );
    expect(biometricErrorMessageKey("insecure_context")).toBe(
      "web.settingsPopup.vault.biometric.error.insecureContext",
    );
    expect(biometricErrorMessageKey("prf_unavailable")).toBe(
      "web.settingsPopup.vault.biometric.error.prfUnavailable",
    );
  });
});

describe("readPrfFirst", () => {
  it("accepts ArrayBuffer and base64url PRF outputs", () => {
    const bytes = new Uint8Array(32).fill(7);
    expect(readPrfFirst({ prf: { results: { first: bytes.buffer } } })).toEqual(bytes);
    expect(
      readPrfFirst({
        prf: { results: { first: Buffer.from(bytes).toString("base64url") } },
      }),
    ).toEqual(bytes);
  });

  it("rejects missing or wrong-length PRF results", () => {
    expect(readPrfFirst({})).toBeNull();
    expect(readPrfFirst({ prf: { results: { first: new Uint8Array(16) } } })).toBeNull();
  });
});

describe("setupBiometricUnlock PRF requirements", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    stubPlatformAuthenticator(true);
    stubSecureWindow();
    deriveBioWrapKeyFromPrf.mockClear();
    generateBioPrfSalt.mockClear();
    wrapUnlockMaterialWithBioKey.mockClear();
    wipeBytes.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses enable when PRF result is missing", async () => {
    const create = vi.fn(async () => ({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: false } }),
    }));
    vi.stubGlobal("navigator", {
      credentials: {
        create,
        get: vi.fn(),
      },
    });

    const result = await setupBiometricUnlock({
      userId: USER,
      vaultKey: new Uint8Array(32).fill(1),
      passwordShareC: new Uint8Array(32).fill(2),
    });
    expect(result).toEqual({ ok: false, code: "prf_unavailable" });
    expect(readBioUnlockWrap(USER)).toBeNull();
    expect(wrapUnlockMaterialWithBioKey).not.toHaveBeenCalled();
  });

  it("derives a wrap key from PRF, persists no key fields, and zeroes buffers", async () => {
    const prfBytes = new Uint8Array(32).fill(5);
    const create = vi.fn(async () => ({
      rawId: new Uint8Array([9, 9]).buffer,
      getClientExtensionResults: () => ({
        prf: { enabled: true, results: { first: prfBytes.buffer } },
      }),
    }));
    vi.stubGlobal("navigator", {
      credentials: {
        create,
        get: vi.fn(),
      },
    });

    const result = await setupBiometricUnlock({
      userId: USER,
      vaultKey: new Uint8Array(32).fill(1),
      passwordShareC: new Uint8Array(32).fill(2),
    });
    expect(result).toEqual({ ok: true });
    expect(deriveBioWrapKeyFromPrf).toHaveBeenCalledTimes(1);
    const stored = readBioUnlockWrap(USER);
    expect(stored).toMatchObject({
      ciphertextB64: "cipher-b64",
      prfSaltB64: expect.any(String),
    });
    expect(stored).not.toHaveProperty("wrapKeyB64");
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as {
      bio: Record<string, unknown>;
    };
    expect(Object.keys(raw.bio).sort()).toEqual([
      "ciphertextB64",
      "credentialIdB64",
      "prfSaltB64",
    ]);
    expect(wipeBytes.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("tryUnlockWithBiometrics", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    stubPlatformAuthenticator(true);
    stubSecureWindow();
    deriveBioWrapKeyFromPrf.mockClear();
    unwrapUnlockMaterialWithBioKey.mockClear();
    wipeBytes.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips unlock material from a PRF-derived key", async () => {
    writeBioUnlockWrap(USER, {
      credentialIdB64: Buffer.from([1, 2, 3]).toString("base64url"),
      ciphertextB64: "cipher-b64",
      prfSaltB64: Buffer.alloc(32, 3).toString("base64"),
    });
    const prfBytes = new Uint8Array(32).fill(5);
    vi.stubGlobal("navigator", {
      credentials: {
        get: vi.fn(async () => ({
          getClientExtensionResults: () => ({
            prf: { results: { first: prfBytes.buffer } },
          }),
        })),
      },
    });

    const unlocked = await tryUnlockWithBiometrics(USER);
    expect(unlocked.ok).toBe(true);
    if (unlocked.ok) {
      expect(unlocked.vaultKey).toEqual(new Uint8Array(32).fill(1));
      expect(unlocked.passwordShareC).toEqual(new Uint8Array(32).fill(2));
    }
    expect(deriveBioWrapKeyFromPrf).toHaveBeenCalledTimes(1);
    expect(wipeBytes.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("fails closed when PRF is missing on unlock", async () => {
    writeBioUnlockWrap(USER, {
      credentialIdB64: Buffer.from([1, 2, 3]).toString("base64url"),
      ciphertextB64: "cipher-b64",
      prfSaltB64: Buffer.alloc(32, 3).toString("base64"),
    });
    vi.stubGlobal("navigator", {
      credentials: {
        get: vi.fn(async () => ({
          getClientExtensionResults: () => ({ prf: { enabled: true } }),
        })),
      },
    });
    await expect(tryUnlockWithBiometrics(USER)).resolves.toEqual({
      ok: false,
      code: "prf_unavailable",
    });
  });
});
