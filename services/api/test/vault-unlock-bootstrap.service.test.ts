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
        return share;
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
