import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { VaultSharingService } from "../src/vault-sharing/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

function errorChainCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isVaultSharingServiceError(error: unknown, code: string): boolean {
  return errorChainCode(error) === code;
}

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
  const recipientId = String(recipient.userId);
  const cleared = await storage.postgres.query<{ public_pq_key: string | null }>(
    "UPDATE users SET public_pq_key = NULL WHERE id = $1::uuid RETURNING public_pq_key",
    [recipientId],
  );
  assert.ok(cleared[0], "UPDATE must match recipient id (use uuid string from registration)");
  assert.ok(
    cleared[0]?.public_pq_key == null || cleared[0]?.public_pq_key === "",
    "expected recipient public_pq_key cleared after UPDATE",
  );

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::uuid LIMIT 1",
    [String(owner.userId)],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::uuid LIMIT 1",
    [String(workspaceId)],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  await storage.postgres.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id)
      VALUES ($1::uuid, $2::uuid)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `,
    [String(workspaceId), recipientId],
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
      sharing.shareVault(String(vaultId), String(owner.userId), {
        recipientUserId: recipientId,
        encryptedVaultKey: mkHybridWrapBlob("wrapped-key", recipientId),
        encryptedPayload: mkBlob("share-event", 2),
        baseVersion: 0,
      }),
    (error: unknown) => isVaultSharingServiceError(error, "VAULT_SHARE_RECIPIENT_PQ_REQUIRED"),
  );
});

test("security: prod rotate rejects non-hybrid key_wrap_scheme even with valid base64 payload", async (t) => {
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
  const ownerId = String(owner.userId);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::uuid LIMIT 1",
    [ownerId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::uuid LIMIT 1",
    [String(workspaceId)],
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
      sharing.rotateVaultKey(String(vaultId), ownerId, {
        rotatedVaultKeys: [
          {
            userId: ownerId,
            encryptedVaultKey: {
              crypto_version: 2,
              algorithm: "opaque",
              // valid base64 payload; server binds recipient_user_id — client cannot spoof mismatch
              payload: Buffer.from("opaque-wrap", "utf8").toString("base64"),
              meta: {
                key_wrap_scheme: "ecc_legacy_v0",
              },
            },
          },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 0,
      }),
    (error: unknown) => {
      if (!isVaultSharingServiceError(error, "VAULT_KEY_WRAP_INVALID")) {
        return false;
      }
      const msg =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as Error).message)
          : "";
      return (
        msg.includes("key_wrap_scheme") ||
        msg.includes("hybrid_ecc_pq_v1") ||
        msg.includes("declare meta")
      );
    },
  );
});
