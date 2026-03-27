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
    payload: Buffer.from(input).toString("base64"),
    meta: {},
  };
}

function mkHybridWrapBlob(input: string, cryptoVersion = 2) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: Buffer.from(input).toString("base64"),
    meta: {
      key_wrap_scheme: "hybrid_ecc_pq_v1",
    },
  };
}

test("integration: share + revoke vault access with key rotation", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-a-${suffix}@okkey.local`;
  const emailB = `vault-share-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, config, emailA);
  const userB = await registerUser(storage, config, emailB);

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b"),
    encryptedPayload: mkBlob("vault-share-event"),
    baseVersion: 0,
  });

  const canReadAfterShare = await storage.repositories.vaults.canReadVault(vaultId, userB.userId);
  assert.equal(canReadAfterShare, true);

  const bKey = await sharing.getUserVaultKey(vaultId, userB.userId);
  assert.equal(
    Buffer.from(bKey.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-b",
  );

  await sharing.revokeVaultAccess(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    rotatedVaultKeys: [
      {
        userId: userA.userId,
        encryptedVaultKey: mkBlob("wrapped-key-a-rotated"),
      },
    ],
    encryptedPayload: mkBlob("vault-key-rotation-event"),
    baseVersion: 1,
  });

  const canReadAfterRevoke = await storage.repositories.vaults.canReadVault(vaultId, userB.userId);
  assert.equal(canReadAfterRevoke, false);

  const events = await storage.repositories.events.listAfterVersion(vaultId, 0);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, "VAULT_SHARE");
  assert.equal(events[1]?.eventType, "VAULT_KEY_ROTATION");
});

test("integration: sharing rejects crypto profile blocked by policy", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-policy-a-${suffix}@okkey.local`;
  const emailB = `vault-share-policy-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [2],
    },
  });

  await assert.rejects(
    () =>
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userB.userId,
        encryptedVaultKey: mkBlob("wrapped-key-b", 1),
        encryptedPayload: mkBlob("vault-share-event", 1),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "CRYPTO_PROFILE_NOT_ALLOWED",
  );
});

test("integration: sharing rejects crypto downgrade below vault event stream max", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-down-a-${suffix}@okkey.local`;
  const emailB = `vault-share-down-b-${suffix}@okkey.local`;
  const emailC = `vault-share-down-c-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailC);
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);
  const userC = await registerUser(storage, baseConfig, emailC);

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
      VALUES ($1, $2), ($1, $3)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `,
    [workspaceId, userB.userId, userC.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: {
      allowedCryptoProfileVersions: [1, 2],
      deployEnv: baseConfig.deployEnv,
    },
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b", 2),
    encryptedPayload: mkBlob("vault-share-event-v2", 2),
    baseVersion: 0,
  });

  await assert.rejects(
    () =>
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userC.userId,
        encryptedVaultKey: mkBlob("wrapped-key-c", 2),
        encryptedPayload: mkBlob("vault-share-event-v1", 1),
        baseVersion: 1,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "CRYPTO_DOWNGRADE_NOT_ALLOWED",
  );
});

test("integration: prod sharing requires recipient PQ key", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-pq-a-${suffix}@okkey.local`;
  const emailB = `vault-share-pq-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);
  await storage.postgres.query("UPDATE users SET public_pq_key = NULL WHERE id = $1", [userB.userId]);

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
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
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userB.userId,
        encryptedVaultKey: mkHybridWrapBlob("wrapped-key-b"),
        encryptedPayload: mkBlob("vault-share-event", 2),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      err.code === "VAULT_SHARE_RECIPIENT_PQ_REQUIRED",
  );
});

test("integration: prod sharing requires hybrid key_wrap_scheme metadata", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-wrap-a-${suffix}@okkey.local`;
  const emailB = `vault-share-wrap-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);

  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
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
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userB.userId,
        encryptedVaultKey: mkBlob("wrapped-key-b", 2),
        encryptedPayload: mkBlob("vault-share-event", 2),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      err.code === "VAULT_KEY_WRAP_INVALID",
  );
});

test("integration: prod sharing rejects wrong recipient key wrap metadata", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-wrong-recipient-a-${suffix}@okkey.local`;
  const emailB = `vault-share-wrong-recipient-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
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
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userB.userId,
        encryptedVaultKey: {
          ...mkHybridWrapBlob("wrapped-key-b"),
          meta: {
            key_wrap_scheme: "hybrid_ecc_pq_v1",
            recipient_user_id: userA.userId,
          },
        },
        encryptedPayload: mkBlob("vault-share-event", 2),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      err.code === "VAULT_KEY_WRAP_INVALID" &&
      err.message.includes("recipient mismatch"),
  );
});

test("integration: sharing rejects corrupted envelope payload", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `vault-share-corrupt-a-${suffix}@okkey.local`;
  const emailB = `vault-share-corrupt-b-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, emailB);
      await cleanupUserData(storage, emailA);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, emailA);
  const userB = await registerUser(storage, baseConfig, emailB);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userA.userId],
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
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await assert.rejects(
    () =>
      sharing.shareVault(vaultId, userA.userId, {
        recipientUserId: userB.userId,
        encryptedVaultKey: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: "%%%NOT_BASE64%%%",
          meta: {
            key_wrap_scheme: "hybrid_ecc_pq_v1",
          },
        },
        encryptedPayload: mkBlob("vault-share-event", 2),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      err.code === "VAULT_KEY_WRAP_INVALID",
  );
});
