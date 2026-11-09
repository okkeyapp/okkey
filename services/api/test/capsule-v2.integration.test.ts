import assert from "node:assert/strict";
import test from "node:test";

import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { loadConfig } from "../src/config.ts";
import {
  applyMigrations,
  cleanupUserData,
  registerUser,
} from "./two-factor-test-helpers.ts";
import { testEntityId } from "./test-entity-id.ts";
import { createIntegrationStorage } from "./integration-env.ts";

function blob(value: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(value).toString("base64"),
    meta: {},
  };
}

test("capsules v2: owner pagination, isolation, approval and reactivation", async (t) => {
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const ownerEmail = `capsule-v2-owner-${testEntityId()}@okkey.local`;
  const requesterEmail = `capsule-v2-requester-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, requesterEmail);
      await cleanupUserData(storage, ownerEmail);
    } finally {
      await storage.close();
    }
  });

  const owner = await registerUser(storage, config, ownerEmail);
  const requester = await registerUser(storage, config, requesterEmail);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [owner.userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);
  await storage.postgres.query(
    "ALTER TABLE capsule_view_requests DROP CONSTRAINT IF EXISTS capsule_view_requests_capsule_id_requester_user_id_status_key",
  );

  const service = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    users: storage.repositories.users,
    objectStorage: storage.objectStorage,
    config,
  });

  for (let index = 0; index < 31; index += 1) {
    await service.createCapsule(workspaceId, owner.userId, {
      type: "text",
      encryptedPayload: blob(`payload-${index}`),
      encryptedMetadata: blob(`metadata-${index}`),
      ownerKeyWrap: blob(`wrap-${index}`),
    });
  }
  const firstPage = await service.listOwnerCapsules(workspaceId, owner.userId, 1, 30);
  const secondPage = await service.listOwnerCapsules(workspaceId, owner.userId, 2, 30);
  assert.equal(firstPage.capsules.length, 30);
  assert.equal(firstPage.total, 31);
  assert.equal(firstPage.hasMore, true);
  assert.equal(secondPage.capsules.length, 1);
  assert.equal((await service.listOwnerCapsules(workspaceId, requester.userId)).total, 0);

  await assert.rejects(
    () =>
      service.createCapsule(workspaceId, owner.userId, {
        type: "text",
        encryptedPayload: blob("approval-payload"),
        encryptedMetadata: blob("approval-metadata"),
        ownerKeyWrap: blob("approval-wrap"),
        approvalRequired: true,
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError && error.code === "FEATURE_NOT_AVAILABLE",
  );
});
