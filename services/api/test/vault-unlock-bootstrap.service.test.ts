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

test("getForBoundDevice returns the session device share and ignores a different fingerprint", async () => {
  const share = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const otherShare = Uint8Array.from({ length: 32 }, () => 9);
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
  let lookedUpId: string | null = null;
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
      findTrustedDeviceShareById: async (_userId, deviceId) => {
        lookedUpId = deviceId;
        if (deviceId !== "d-session") {
          return null;
        }
        return { deviceShare: share, deviceFingerprint: "web_app-chrome-macos-14.5" };
      },
    },
  });

  const result = await service.getForBoundDevice({
    userId: "u1",
    deviceId: "d-session",
    queryFingerprint: "web_app-chrome-macos-14.5",
  });
  assert.equal(lookedUpId, "d-session");
  assert.equal(result.device_share, Buffer.from(share).toString("base64"));
  assert.notEqual(result.device_share, Buffer.from(otherShare).toString("base64"));

  await assert.rejects(
    () =>
      service.getForBoundDevice({
        userId: "u1",
        deviceId: "d-session",
        queryFingerprint: "web_app-firefox-linux-6.1",
      }),
    (err: unknown) =>
      err instanceof VaultUnlockBootstrapError && err.code === "VAULT_UNLOCK_DEVICE_NOT_FOUND",
  );
});

test("getForBoundDevice rejects an invalid query fingerprint", async () => {
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
      findTrustedDeviceShareById: async () => {
        throw new Error("should not be called for invalid fp");
      },
    },
  });

  await assert.rejects(
    () =>
      service.getForBoundDevice({
        userId: "u1",
        deviceId: "d-session",
        queryFingerprint: "bad",
      }),
    (err: unknown) =>
      err instanceof VaultUnlockBootstrapError && err.code === "VAULT_UNLOCK_INVALID_FINGERPRINT",
  );
});
