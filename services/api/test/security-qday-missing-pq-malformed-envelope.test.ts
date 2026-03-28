import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { VaultSharingService, VaultSharingServiceError } from "../src/vault-sharing/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

function mkBlob(input: string, cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(input, "utf8").toString("base64"),
    meta: {},
  };
}

function mkHybridWrapBlob(input: string, recipientUserId: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(input, "utf8").toString("base64"),
    meta: {
      key_wrap_scheme: "hybrid_ecc_pq_v1",
      recipient_user_id: recipientUserId,
    },
  };
}

test("security: prod share rejects recipient without PQ key", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `sec-pq-owner-${suffix}@okkey.local`;
  const emailB = `sec-pq-recipient-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const owner = await registerUser(storage, baseConfig, emailA);
  const recipient = await registerUser(storage, baseConfig, emailB);
  await storage.postgres.query("UPDATE users SET public_pq_key = NULL WHERE id = $1", [recipient.userId]);

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [owner.userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1 LIMIT 1",
    [workspaceId],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  await storage.postgres.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `,
    [workspaceId, recipient.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "prod",
    },
  });

  await assert.rejects(
    () =>
      sharing.shareVault(vaultId, owner.userId, {
        recipientUserId: recipient.userId,
        encryptedVaultKey: mkHybridWrapBlob("wrapped-key", recipient.userId),
        encryptedPayload: mkBlob("share-event", 2),
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof VaultSharingServiceError &&
      error.code === "VAULT_SHARE_RECIPIENT_PQ_REQUIRED",
  );
});

test("security: prod rotate rejects malformed hybrid envelope metadata even with valid base64 payload", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `sec-malformed-wrap-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const owner = await registerUser(storage, baseConfig, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [owner.userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1 LIMIT 1",
    [workspaceId],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "prod",
    },
  });

  await assert.rejects(
    () =>
      sharing.rotateVaultKey(vaultId, owner.userId, {
        rotatedVaultKeys: [
          {
            userId: owner.userId,
            encryptedVaultKey: {
              crypto_version: 2,
              algorithm: "opaque",
              // valid base64 payload, malformed hybrid metadata for recipient binding
              payload: Buffer.from("opaque-wrap", "utf8").toString("base64"),
              meta: {
                key_wrap_scheme: "hybrid_ecc_pq_v1",
                recipient_user_id: randomUUID(),
              },
            },
          },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof VaultSharingServiceError &&
      error.code === "VAULT_KEY_WRAP_INVALID" &&
      error.message.includes("recipient mismatch"),
  );
});
