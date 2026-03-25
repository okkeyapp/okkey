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
    encryptedVaultKey: Buffer.from("wrapped-key-b").toString("base64"),
    encryptedPayload: Buffer.from("vault-share-event").toString("base64"),
    baseVersion: 0,
  });

  const canReadAfterShare = await storage.repositories.vaults.canReadVault(vaultId, userB.userId);
  assert.equal(canReadAfterShare, true);

  const bKey = await sharing.getUserVaultKey(vaultId, userB.userId);
  assert.equal(
    Buffer.from(bKey.encryptedVaultKey, "base64").toString("utf8"),
    "wrapped-key-b",
  );

  await sharing.revokeVaultAccess(vaultId, userA.userId, {
    recipientUserId: userB.userId,
    rotatedVaultKeys: [
      {
        userId: userA.userId,
        encryptedVaultKey: Buffer.from("wrapped-key-a-rotated").toString("base64"),
      },
    ],
    encryptedPayload: Buffer.from("vault-key-rotation-event").toString("base64"),
    baseVersion: 1,
  });

  const canReadAfterRevoke = await storage.repositories.vaults.canReadVault(vaultId, userB.userId);
  assert.equal(canReadAfterRevoke, false);

  const events = await storage.repositories.events.listAfterVersion(vaultId, 0);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, "VAULT_SHARE");
  assert.equal(events[1]?.eventType, "VAULT_KEY_ROTATION");
});
