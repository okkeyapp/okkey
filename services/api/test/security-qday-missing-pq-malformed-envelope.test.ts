import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { loadConfig } from "../src/config.ts";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
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

import { isEntityId } from "../src/entity-id.ts";

function pgWireEntityId(value: unknown): string {
  const s = String(value).trim();
  if (!isEntityId(s)) {
    throw new Error(`expected entity id from database, got: ${s}`);
  }
  return s;
}

async function userIdByEmail(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  email: string,
): Promise<string> {
  const rows = await storage.postgres.query<{ id: unknown }>(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  assert.ok(rows[0], `expected user row for ${email}`);
  return pgWireEntityId(rows[0].id);
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

  const suffix = testEntityId();
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

  await registerUser(storage, baseConfig, emailA);
  await registerUser(storage, baseConfig, emailB);
  const ownerId = await userIdByEmail(storage, emailA);
  const recipientId = await userIdByEmail(storage, emailB);
  const cleared = await storage.postgres.query<{ public_pq_key: string | null }>(
    "UPDATE users SET public_pq_key = NULL WHERE id = $1::bigint RETURNING public_pq_key",
    [recipientId],
  );
  assert.ok(cleared[0], "UPDATE must match recipient id (use uuid string from registration)");
  assert.ok(
    cleared[0]?.public_pq_key == null || cleared[0]?.public_pq_key === "",
    "expected recipient public_pq_key cleared after UPDATE",
  );

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::bigint LIMIT 1",
    [ownerId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const wsId = pgWireEntityId(workspaceId);
  const vaultRows = await storage.postgres.query<{ id: unknown }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::bigint LIMIT 1",
    [wsId],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  await storage.postgres.query(
    `
      INSERT INTO workspace_members (id, workspace_id, user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `,
    [testEntityId(), wsId, recipientId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "prod",
    },
  });

  try {
    await sharing.shareVault(pgWireEntityId(vaultId), ownerId, {
      recipientUserId: recipientId,
      encryptedVaultKey: mkHybridWrapBlob("wrapped-key", recipientId),
      encryptedPayload: mkBlob("share-event", 2),
      baseVersion: 0,
    });
    assert.fail("expected shareVault to reject when recipient has no PQ key in prod");
  } catch (error) {
    assert.strictEqual(
      errorChainCode(error),
      "VAULT_SHARE_RECIPIENT_PQ_REQUIRED",
      `unexpected rejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
  }
});

test("security: prod rotate rejects non-hybrid key_wrap_scheme even with valid base64 payload", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `sec-malformed-wrap-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  await registerUser(storage, baseConfig, email);
  const ownerId = await userIdByEmail(storage, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::bigint LIMIT 1",
    [ownerId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  const wsId = pgWireEntityId(workspaceId);
  const vaultRows = await storage.postgres.query<{ id: unknown }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::bigint LIMIT 1",
    [wsId],
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

  try {
    await sharing.rotateVaultKey(pgWireEntityId(vaultId), ownerId, {
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
    });
    assert.fail("expected rotateVaultKey to reject non-hybrid key_wrap_scheme in prod");
  } catch (error) {
    assert.strictEqual(
      errorChainCode(error),
      "VAULT_KEY_WRAP_INVALID",
      `unexpected rejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
    const msg = error instanceof Error ? error.message : String(error);
    assert.ok(
      msg.includes("key_wrap_scheme") ||
        msg.includes("hybrid_ecc_pq_v1") ||
        msg.includes("declare meta"),
      `expected key-wrap policy message, got: ${msg}`,
    );
  }
});

test("security: strict rollout rejects share without recipient PQ capability (no silent fallback)", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const emailA = `sec-strict-owner-${suffix}@okkey.local`;
  const emailB = `sec-strict-recipient-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  await registerUser(storage, baseConfig, emailA);
  await registerUser(storage, baseConfig, emailB);
  const ownerId = await userIdByEmail(storage, emailA);
  const recipientId = await userIdByEmail(storage, emailB);
  await storage.postgres.query(
    "UPDATE users SET public_pq_key = NULL WHERE id = $1::bigint",
    [recipientId],
  );

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::bigint LIMIT 1",
    [ownerId],
  );
  const wsId = pgWireEntityId(workspaceRows[0]?.id);
  const vaultRows = await storage.postgres.query<{ id: unknown }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::bigint LIMIT 1",
    [wsId],
  );
  const vaultId = pgWireEntityId(vaultRows[0]?.id);
  assert.ok(vaultId);

  await storage.postgres.query(
    `INSERT INTO workspace_members (id, workspace_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [testEntityId(), wsId, recipientId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "strict",
    },
  });

  try {
    await sharing.shareVault(vaultId, ownerId, {
      recipientUserId: recipientId,
      encryptedVaultKey: mkBlob("wrapped-key", 2),
      encryptedPayload: mkBlob("share-event", 2),
      baseVersion: 0,
    });
    assert.fail("expected strict rollout capability rejection");
  } catch (error) {
    assert.strictEqual(
      errorChainCode(error),
      "CRYPTO_CAPABILITY_REQUIRED",
      `unexpected rejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
  }
});

test("security: strict rollout rejects sync append without actor PQ capability", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `sec-strict-sync-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  await registerUser(storage, baseConfig, email);
  const userId = await userIdByEmail(storage, email);
  await storage.postgres.query("UPDATE users SET public_pq_key = NULL WHERE id = $1::bigint", [userId]);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::bigint LIMIT 1",
    [userId],
  );
  const wsId = pgWireEntityId(workspaceRows[0]?.id);
  const vaultRows = await storage.postgres.query<{ id: unknown }>(
    "SELECT id FROM vaults WHERE workspace_id = $1::bigint LIMIT 1",
    [wsId],
  );
  const vaultId = pgWireEntityId(vaultRows[0]?.id);
  assert.ok(vaultId);

  const sync = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    users: storage.repositories.users,
    config: {
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "strict",
    },
  });

  await assert.rejects(
    () =>
      sync.appendEvent(vaultId, userId, {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlob("sync-event", 2),
        baseVersion: 0,
      }),
    (error: unknown) =>
      error instanceof SyncServiceError && error.code === "CRYPTO_CAPABILITY_REQUIRED",
  );
});

test("security: strict rollout rejects capsule create without actor PQ capability", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `sec-strict-capsule-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  await registerUser(storage, baseConfig, email);
  const userId = await userIdByEmail(storage, email);
  await storage.postgres.query("UPDATE users SET public_pq_key = NULL WHERE id = $1::bigint", [userId]);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1::bigint LIMIT 1",
    [userId],
  );
  const wsId = pgWireEntityId(workspaceRows[0]?.id);
  assert.ok(wsId);

  const capsule = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    users: storage.repositories.users,
    objectStorage: storage.objectStorage,
    config: {
      sessionSecret: baseConfig.sessionSecret,
      capsuleOpenRateLimitPerIp: baseConfig.capsuleOpenRateLimitPerIp,
      capsuleRateLimitWindowSeconds: baseConfig.capsuleRateLimitWindowSeconds,
      allowedCryptoProfileVersions: [2],
      deployEnv: "dev",
      cryptoRolloutMode: "strict",
    },
  });

  await assert.rejects(
    () =>
      capsule.createCapsule(wsId, userId, {
        type: "item",
        encryptedPayload: mkBlob("capsule-event", 2),
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError &&
      error.code === "CRYPTO_CAPABILITY_REQUIRED",
  );
});
