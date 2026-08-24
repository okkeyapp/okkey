import assert from "node:assert/strict";
import test from "node:test";

import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";
import { testEntityId } from "./test-entity-id.ts";

function blob(value: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(value).toString("base64"),
    meta: {},
  };
}

test("capsules v2: owner pagination, isolation, approval and reactivation", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
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

  const approvalCapsule = await service.createCapsule(workspaceId, owner.userId, {
    type: "text",
    encryptedPayload: blob("approval-payload"),
    encryptedMetadata: blob("approval-metadata"),
    ownerKeyWrap: blob("approval-wrap"),
    allowedRecipientEmails: [requesterEmail],
    approvalRequired: true,
  });
  const pending = await service.requestCapsuleApproval({
    capsuleId: approvalCapsule.capsuleId,
    requesterUserId: requester.userId,
    requestIp: "203.0.113.10",
    deviceLabel: "Browser on Test",
    platform: "Test OS",
  });
  assert.equal(pending.status, "pending");
  assert.equal((await service.listPendingApprovals(owner.userId)).length, 1);
  assert.equal(await service.resolveApproval(pending.requestId, owner.userId, "approve"), "approved");
  const approved = await service.getApprovalStatus(pending.requestId, requester.userId);
  assert.equal(approved.status, "approved");
  assert.ok(approved.approvalToken);
  const opened = await service.openCapsule(
    approvalCapsule.capsuleId,
    "203.0.113.10",
    undefined,
    undefined,
    "fragment",
    approved.approvalToken,
    requester.userId,
  );
  assert.equal(opened.viewCount, 1);
  assert.equal((await service.getApprovalStatus(pending.requestId, requester.userId)).status, "consumed");

  const deniedCapsule = await service.createCapsule(workspaceId, owner.userId, {
    type: "text",
    encryptedPayload: blob("denied-payload"),
    encryptedMetadata: blob("denied-metadata"),
    ownerKeyWrap: blob("denied-wrap"),
    allowedRecipientEmails: [requesterEmail],
    approvalRequired: true,
  });
  const deniedRequest = await service.requestCapsuleApproval({
    capsuleId: deniedCapsule.capsuleId,
    requesterUserId: requester.userId,
    requestIp: "203.0.113.11",
  });
  await service.resolveApproval(deniedRequest.requestId, owner.userId, "deny");
  await assert.rejects(
    () =>
      service.requestCapsuleApproval({
        capsuleId: deniedCapsule.capsuleId,
        requesterUserId: requester.userId,
        requestIp: "203.0.113.11",
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError &&
      (error.code === "CAPSULE_INACTIVE" || error.code === "CAPSULE_APPROVAL_DENIED"),
  );
  const reactivated = await service.setCapsuleState(deniedCapsule.capsuleId, owner.userId, "active");
  assert.equal(reactivated.state, "active");
  const afterReactivation = await service.requestCapsuleApproval({
    capsuleId: deniedCapsule.capsuleId,
    requesterUserId: requester.userId,
    requestIp: "203.0.113.11",
  });
  assert.equal(afterReactivation.status, "pending");

  const guestCapsule = await service.createCapsule(workspaceId, owner.userId, {
    type: "text",
    encryptedPayload: blob("guest-approval-payload"),
    encryptedMetadata: blob("guest-approval-metadata"),
    ownerKeyWrap: blob("guest-approval-wrap"),
    approvalRequired: true,
  });
  const guestSessionId = `guest-session-${testEntityId()}`;
  const guestPending = await service.requestCapsuleApproval({
    capsuleId: guestCapsule.capsuleId,
    guestSessionId,
    requestIp: "203.0.113.20",
    deviceLabel: "Guest Browser",
    platform: "Test OS",
  });
  assert.equal(guestPending.status, "pending");
  assert.equal(await service.resolveApproval(guestPending.requestId, owner.userId, "approve"), "approved");
  const guestApproved = await service.getApprovalStatus(
    guestPending.requestId,
    undefined,
    guestSessionId,
  );
  assert.equal(guestApproved.status, "approved");
  assert.ok(guestApproved.approvalToken);
  const guestOpened = await service.openCapsule(
    guestCapsule.capsuleId,
    "203.0.113.20",
    undefined,
    undefined,
    "fragment",
    guestApproved.approvalToken,
    undefined,
    guestSessionId,
  );
  assert.equal(guestOpened.viewCount, 1);
});
