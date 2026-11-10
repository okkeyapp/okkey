import test from "node:test";
import assert from "node:assert/strict";

import { STORAGE_QUOTA_BYTES_PER_MIB } from "../../../packages/types/src/plan-features.ts";
import { loadConfig } from "../src/config.ts";
import { PlanQuotaExceededError } from "../src/storage-quota/service.ts";
import { WorkspaceStorageQuotaService } from "../src/storage-quota/service.ts";
import { SyncService } from "../src/sync/service.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { testEntityId } from "./test-entity-id.ts";
import { applyMigrations, cleanupUserData, registerUser } from "./two-factor-test-helpers.ts";

test("integration: SaaS FREE counts item ciphertext and still accepts deletes", async (t) => {
  let loaded: ReturnType<typeof loadConfig>;
  try {
    loaded = loadConfig();
  } catch (error) {
    t.skip(error instanceof Error ? error.message : "api config unavailable");
    return;
  }
  const config = { ...loaded, deploymentMode: "saas" as const, enterpriseModulesEnabled: false };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);

  const email = `storage-quota-${testEntityId()}@okkey.local`;
  const quota = new WorkspaceStorageQuotaService({
    db: storage.postgres,
    config: { deploymentMode: "saas", enterpriseModulesEnabled: false },
  });
  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
    workspaces: storage.repositories.workspaces,
    storageQuota: quota,
    config,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const wsRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = wsRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'FREE' WHERE id = $1", [workspaceId]);

  const vaultRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM vaults WHERE workspace_id = $1 AND is_personal = true LIMIT 1",
    [workspaceId],
  );
  const vaultId = vaultRows[0]?.id;
  assert.ok(vaultId);

  const itemId = testEntityId();
  const created = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from("ciphertext-note").toString("base64"),
      meta: {},
    },
    baseVersion: 0,
    idempotencyKey: testEntityId(),
    referencedItemId: itemId,
  });
  assert.equal(created.eventType, "ITEM_CREATE");

  const snapshot = await quota.snapshot({ id: workspaceId, planTier: "FREE" });
  assert.equal(snapshot.limitMb, 100);
  assert.ok(snapshot.usedBytes > 0);
  const stored = await storage.postgres.query<{ bytes: string }>(
    `
      SELECT octet_length(encrypted_payload)::text AS bytes
      FROM events
      WHERE vault_id = $1
    `,
    [vaultId],
  );
  assert.equal(snapshot.usedBytes, Number(stored[0]?.bytes ?? 0));

  await assert.rejects(
    () =>
      quota.assertAdditionalBytes({
        workspace: { id: workspaceId, planTier: "FREE" },
        additionalBytes: 100 * STORAGE_QUOTA_BYTES_PER_MIB,
      }),
    (error: unknown) => error instanceof PlanQuotaExceededError && error.code === "PLAN_QUOTA_EXCEEDED",
  );

  const deleted = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_DELETE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from("delete").toString("base64"),
      meta: {},
    },
    baseVersion: created.version,
    referencedItemId: itemId,
    itemDeletedAtMs: Date.now(),
  });
  assert.equal(deleted.eventType, "ITEM_DELETE");

  const afterDelete = await quota.snapshot({ id: workspaceId, planTier: "FREE" });
  assert.equal(afterDelete.usedBytes, 0);
});
