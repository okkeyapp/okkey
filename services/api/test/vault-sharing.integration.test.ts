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
      err instanceof VaultSharingServiceError && err.code === "CRYPTO_DOWNGRADE_NOT_ALLOWED",
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

// ─── 6.10 PQ-aware key rotation tests ────────────────────────────────────────

test("integration: rotateVaultKey (standalone manual rotation)", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `rotate-a-${suffix}@okkey.local`;
  const emailB = `rotate-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b-v1"),
    encryptedPayload: mkBlob("vault-share-event"),
    baseVersion: 0,
  });

  await sharing.rotateVaultKey(vaultId, userA.userId, {
    rotatedVaultKeys: [
      { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-rotated") },
      { userId: userB.userId, encryptedVaultKey: mkBlob("wrapped-key-b-rotated") },
    ],
    encryptedPayload: mkBlob("rotation-event"),
    baseVersion: 1,
    reason: "manual",
  });

  const keyA = await sharing.getUserVaultKey(vaultId, userA.userId);
  assert.equal(
    Buffer.from(keyA.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-a-rotated",
  );

  const keyB = await sharing.getUserVaultKey(vaultId, userB.userId);
  assert.equal(
    Buffer.from(keyB.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-b-rotated",
  );

  const events = await storage.repositories.events.listAfterVersion(vaultId, 0);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, "VAULT_SHARE");
  assert.equal(events[1]?.eventType, "VAULT_KEY_ROTATION");
});

test("integration: rotateVaultKey rejects missing recipient in rotatedVaultKeys", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `rotate-miss-a-${suffix}@okkey.local`;
  const emailB = `rotate-miss-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b-v1"),
    encryptedPayload: mkBlob("vault-share-event"),
    baseVersion: 0,
  });

  await assert.rejects(
    () =>
      sharing.rotateVaultKey(vaultId, userA.userId, {
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-rotated") },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 1,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "VAULT_KEY_WRAP_INVALID",
  );
});

test("integration: rotateVaultKey rejects unknown recipient in rotatedVaultKeys", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `rotate-unknown-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, config, email);
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

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await assert.rejects(
    () =>
      sharing.rotateVaultKey(vaultId, userA.userId, {
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-rotated") },
          { userId: randomUUID(), encryptedVaultKey: mkBlob("wrapped-key-unknown") },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "VAULT_KEY_WRAP_INVALID",
  );
});

test("integration: updateVaultMemberRole changes role and rotates keys", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `role-upd-a-${suffix}@okkey.local`;
  const emailB = `role-upd-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b-v1"),
    encryptedPayload: mkBlob("vault-share-event"),
    baseVersion: 0,
    role: "member",
  });

  await sharing.updateVaultMemberRole(vaultId, userA.userId, {
    memberId: userB.userId,
    newRole: "admin",
    rotatedVaultKeys: [
      { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-after-role-change") },
      { userId: userB.userId, encryptedVaultKey: mkBlob("wrapped-key-b-after-role-change") },
    ],
    encryptedPayload: mkBlob("role-rotation-event"),
    baseVersion: 1,
  });

  const memberRows = await storage.postgres.query<{ role: string }>(
    "SELECT role FROM vault_members WHERE vault_id = $1 AND user_id = $2",
    [vaultId, userB.userId],
  );
  assert.equal(memberRows[0]?.role, "admin");

  const keyA = await sharing.getUserVaultKey(vaultId, userA.userId);
  assert.equal(
    Buffer.from(keyA.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-a-after-role-change",
  );
  const keyB = await sharing.getUserVaultKey(vaultId, userB.userId);
  assert.equal(
    Buffer.from(keyB.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-b-after-role-change",
  );

  const events = await storage.repositories.events.listAfterVersion(vaultId, 0);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, "VAULT_SHARE");
  assert.equal(events[1]?.eventType, "VAULT_KEY_ROTATION");
});

test("integration: updateVaultMemberRole rejects non-member", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `role-nonmember-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, config, email);
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

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await assert.rejects(
    () =>
      sharing.updateVaultMemberRole(vaultId, userA.userId, {
        memberId: randomUUID(),
        newRole: "admin",
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a") },
        ],
        encryptedPayload: mkBlob("role-rotation-event"),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "MEMBERSHIP_CONFLICT",
  );
});

test("security: revoked user cannot read vault key after subsequent rotateVaultKey", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `sec-rot-a-${suffix}@okkey.local`;
  const emailB = `sec-rot-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-key-b"),
    encryptedPayload: mkBlob("share-event"),
    baseVersion: 0,
  });

  await sharing.revokeVaultAccess(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    rotatedVaultKeys: [
      { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-rotated") },
    ],
    encryptedPayload: mkBlob("revoke-event"),
    baseVersion: 1,
  });

  await sharing.rotateVaultKey(vaultId, userA.userId, {
    rotatedVaultKeys: [
      { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-key-a-incident") },
    ],
    encryptedPayload: mkBlob("incident-rotation-event"),
    baseVersion: 2,
    reason: "security_incident",
  });

  await assert.rejects(
    () => sharing.getUserVaultKey(vaultId, userB.userId),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      (err.code === "VAULT_KEY_NOT_FOUND" || err.code === "ACCESS_DENIED"),
  );

  const keyA = await sharing.getUserVaultKey(vaultId, userA.userId);
  assert.equal(
    Buffer.from(keyA.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-key-a-incident",
  );
});

test("security: rotateVaultKey does not leave stale wrapped keys in vault_keys", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `stale-rot-a-${suffix}@okkey.local`;
  const emailB = `stale-rot-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  await sharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-b-old"),
    encryptedPayload: mkBlob("share-event"),
    baseVersion: 0,
  });

  await sharing.rotateVaultKey(vaultId, userA.userId, {
    rotatedVaultKeys: [
      { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-a-new") },
      { userId: userB.userId, encryptedVaultKey: mkBlob("wrapped-b-new") },
    ],
    encryptedPayload: mkBlob("rotation-event"),
    baseVersion: 1,
  });

  const keyRows = await storage.postgres.query<{ user_id: string }>(
    "SELECT user_id FROM vault_keys WHERE vault_id = $1 ORDER BY user_id",
    [vaultId],
  );
  assert.equal(keyRows.length, 2);

  const kA = await sharing.getUserVaultKey(vaultId, userA.userId);
  assert.equal(
    Buffer.from(kA.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-a-new",
  );
  const kB = await sharing.getUserVaultKey(vaultId, userB.userId);
  assert.equal(
    Buffer.from(kB.encryptedVaultKey.payload, "base64").toString("utf8"),
    "wrapped-b-new",
  );
});

test("concurrency: parallel rotateVaultKey calls with same baseVersion → second gets VERSION_MISMATCH", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `concurrent-rot-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, config, email);
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

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
  });

  const results = await Promise.allSettled([
    sharing.rotateVaultKey(vaultId, userA.userId, {
      rotatedVaultKeys: [
        { userId: userA.userId, encryptedVaultKey: mkBlob(`wrapped-a-${randomUUID()}`) },
      ],
      encryptedPayload: mkBlob("rotation-event-1"),
      baseVersion: 0,
    }),
    sharing.rotateVaultKey(vaultId, userA.userId, {
      rotatedVaultKeys: [
        { userId: userA.userId, encryptedVaultKey: mkBlob(`wrapped-a-${randomUUID()}`) },
      ],
      encryptedPayload: mkBlob("rotation-event-2"),
      baseVersion: 0,
    }),
  ]);

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");

  assert.equal(succeeded.length, 1, "exactly one rotation should succeed");
  assert.equal(failed.length, 1, "exactly one rotation should fail");

  const failedReason = (failed[0] as PromiseRejectedResult).reason;
  assert.ok(
    failedReason instanceof VaultSharingServiceError && failedReason.code === "VERSION_MISMATCH",
    `expected VERSION_MISMATCH, got: ${(failedReason as Error)?.message}`,
  );
});

test("integration: prod rotateVaultKey rejects wrap without hybrid scheme", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `prod-rotate-scheme-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, email);
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

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: { allowedCryptoProfileVersions: [2], deployEnv: "prod" },
  });

  // Plain blob without hybrid scheme — must be rejected in prod
  await assert.rejects(
    () =>
      sharing.rotateVaultKey(vaultId, userA.userId, {
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-a", 2) },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "VAULT_KEY_WRAP_INVALID",
  );
});

test("integration: prod rotateVaultKey rejects wrap without recipient PQ key", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `prod-rotate-pq-${suffix}@okkey.local`;

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const userA = await registerUser(storage, baseConfig, email);
  // Remove PQ key to simulate a legacy user
  await storage.postgres.query("UPDATE users SET public_pq_key = NULL WHERE id = $1", [userA.userId]);

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

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: { allowedCryptoProfileVersions: [2], deployEnv: "prod" },
  });

  await assert.rejects(
    () =>
      sharing.rotateVaultKey(vaultId, userA.userId, {
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkHybridWrapBlob("wrapped-a") },
        ],
        encryptedPayload: mkBlob("rotation-event"),
        baseVersion: 0,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError &&
      err.code === "VAULT_SHARE_RECIPIENT_PQ_REQUIRED",
  );
});

test("integration: prod updateVaultMemberRole rejects wrap without hybrid scheme", async (t) => {
  const baseConfig = loadConfig();
  const storage = await createStorageLayer(baseConfig, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const emailA = `prod-role-scheme-a-${suffix}@okkey.local`;
  const emailB = `prod-role-scheme-b-${suffix}@okkey.local`;

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
    `INSERT INTO workspace_members (workspace_id, user_id) VALUES ($1, $2)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userB.userId],
  );

  const sharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: { allowedCryptoProfileVersions: [2], deployEnv: "prod" },
  });

  // First share B without prod policy (dev mode) to set up the member
  const devSharing = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config: { allowedCryptoProfileVersions: [2], deployEnv: "dev" },
  });
  await devSharing.shareVault(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    encryptedVaultKey: mkBlob("wrapped-b"),
    encryptedPayload: mkBlob("share-event"),
    baseVersion: 0,
  });

  // Now attempt role update in prod mode with plain (non-hybrid) wraps
  await assert.rejects(
    () =>
      sharing.updateVaultMemberRole(vaultId, userA.userId, {
        memberId: userB.userId,
        newRole: "admin",
        rotatedVaultKeys: [
          { userId: userA.userId, encryptedVaultKey: mkBlob("wrapped-a", 2) },
          { userId: userB.userId, encryptedVaultKey: mkBlob("wrapped-b", 2) },
        ],
        encryptedPayload: mkBlob("role-rotation-event"),
        baseVersion: 1,
      }),
    (err: unknown) =>
      err instanceof VaultSharingServiceError && err.code === "VAULT_KEY_WRAP_INVALID",
  );
});
