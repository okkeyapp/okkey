import assert from "node:assert/strict";
import test from "node:test";

import {
  VaultUnlockBootstrapError,
  VaultUnlockBootstrapService,
} from "../src/account/vault-unlock-bootstrap.ts";

test("getForBoundDevice returns the session device share", async () => {
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
        return { share };
      },
    },
  });

  const result = await service.getForBoundDevice({
    userId: "u1",
    deviceId: "d-session",
  });
  assert.equal(lookedUpId, "d-session");
  assert.equal(result.device_share, Buffer.from(share).toString("base64"));

  await assert.rejects(
    () =>
      service.getForBoundDevice({
        userId: "u1",
        deviceId: "d-other",
      }),
    (err: unknown) =>
      err instanceof VaultUnlockBootstrapError && err.code === "VAULT_UNLOCK_DEVICE_NOT_FOUND",
  );
});

test("getForBoundDevice keeps unlock material when the stored share was cleared", async () => {
  const identityBlob = Uint8Array.from(
    Buffer.from(
      JSON.stringify({
        crypto_version: 2,
        algorithm: "opaque",
        payload: Buffer.alloc(16, 7).toString("base64"),
        meta: {},
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
      findTrustedDeviceShareById: async () => ({ share: null }),
    },
  });

  const result = await service.getForBoundDevice({
    userId: "u1",
    deviceId: "d-session",
  });
  assert.equal(result.device_share, "");
  assert.equal(result.server_key_share, Buffer.alloc(32, 9).toString("base64"));
  assert.equal(result.password_kdf_params_version, 2);
});

test("getForBoundDevice tells an older client to update when the identity bundle is ML-DSA", async () => {
  const identityBlob = Uint8Array.from(
    Buffer.from(
      JSON.stringify({
        crypto_version: 2,
        algorithm: "opaque",
        payload: Buffer.alloc(16, 7).toString("base64"),
        meta: { identity: "ed25519_mlkem768_mldsa65_v2", bundle_version: 3 },
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
      findTrustedDeviceShareById: async () => ({ share: Buffer.alloc(32, 4) }),
    },
  });

  const current = await service.getForBoundDevice({
    userId: "u1",
    deviceId: "d1",
    clientSupportsMlDsaIdentity: true,
  });
  assert.equal(current.encrypted_private_key.meta.identity, "ed25519_mlkem768_mldsa65_v2");

  await assert.rejects(
    () =>
      service.getForBoundDevice({
        userId: "u1",
        deviceId: "d1",
        clientSupportsMlDsaIdentity: false,
      }),
    (err: unknown) =>
      err instanceof VaultUnlockBootstrapError &&
      err.code === "CLIENT_UPGRADE_REQUIRED" &&
      err.statusCode === 426,
  );
});
