import assert from "node:assert/strict";
import test from "node:test";

import {
  isUnlockBootstrapFingerprint,
  VaultUnlockBootstrapError,
  VaultUnlockBootstrapService,
} from "../src/account/vault-unlock-bootstrap.ts";

test("isUnlockBootstrapFingerprint accepts structured and legacy hex", () => {
  assert.equal(isUnlockBootstrapFingerprint("web_app-chrome-macos-14.5"), true);
  assert.equal(isUnlockBootstrapFingerprint("a".repeat(64)), true);
  assert.equal(isUnlockBootstrapFingerprint("not-a-fingerprint"), false);
});

test("getForUser accepts structured fingerprint used by web clients", async () => {
  const share = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const identityBlob = Uint8Array.from(
    Buffer.from(
      JSON.stringify({
        crypto_version: 2,
        algorithm: "opaque",
        payload: Buffer.alloc(16, 7).toString("base64"),
        meta: { entity: "identity_private_key" },
      }),
      "utf8",
    ),
  );
  const service = new VaultUnlockBootstrapService({
    users: {
      loadVaultUnlockRow: async () => ({
        serverKeyShare: Buffer.alloc(32, 9),
        passwordKdfSalt: Buffer.alloc(16, 8),
        passwordKdfParamsVersion: 2,
        encryptedPrivateKey: identityBlob,
      }),
    },
    devices: {
      findTrustedDeviceShareForUnlock: async (_userId, fingerprint) => {
        assert.equal(fingerprint, "web_app-chrome-macos-14.5");
        return share;
      },
    },
  });

  const result = await service.getForUser("u1", "web_app-chrome-macos-14.5");
  assert.equal(result.device_share, Buffer.from(share).toString("base64"));
  assert.equal(result.password_kdf_params_version, 2);
});

test("getForUser rejects obsolete 64-hex-only gate for structured ids", async () => {
  const service = new VaultUnlockBootstrapService({
    users: {
      loadVaultUnlockRow: async () => ({
        serverKeyShare: Buffer.alloc(32, 1),
        passwordKdfSalt: Buffer.alloc(16, 2),
        passwordKdfParamsVersion: 2,
        encryptedPrivateKey: Uint8Array.from([1, 2, 3]),
      }),
    },
    devices: {
      findTrustedDeviceShareForUnlock: async () => {
        throw new Error("should not be called for invalid fp");
      },
    },
  });

  await assert.rejects(
    () => service.getForUser("u1", "bad"),
    (err: unknown) =>
      err instanceof VaultUnlockBootstrapError && err.code === "VAULT_UNLOCK_INVALID_FINGERPRINT",
  );
});
