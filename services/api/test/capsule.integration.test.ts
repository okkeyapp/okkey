import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
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

function mkBlob(input: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(input).toString("base64"),
    meta: {},
  };
}

test("integration: capsule create/open with password and view limit", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-owner-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    keyTransportMode: "fragment",
    encryptedPayload: mkBlob("capsule-ciphertext"),
    maxViews: 1,
    password: "12345",
    allowedRecipientEmails: ["recipient@okkey.local"],
  });
  assert.equal(created.passwordRequired, true);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1"),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CAPSULE_PASSWORD_REQUIRED",
  );
  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1", "bad-password"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_PASSWORD_INVALID",
  );
  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1", "12345"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_RECIPIENT_REQUIRED",
  );
  await assert.rejects(
    () =>
      capsules.openCapsule(
        created.capsuleId,
        "127.0.0.1",
        "12345",
        "blocked@okkey.local",
      ),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_RECIPIENT_FORBIDDEN",
  );

  const opened = await capsules.openCapsule(
    created.capsuleId,
    "127.0.0.1",
    "12345",
    "recipient@okkey.local",
    "fragment",
  );
  assert.equal(Buffer.from(opened.encryptedPayload.payload, "base64").toString("utf8"), "capsule-ciphertext");
  assert.equal(opened.viewCount, 1);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1", "12345"),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CAPSULE_VIEW_LIMIT_EXCEEDED",
  );
});

test("integration: file capsule persists encrypted blob in object storage", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-file-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "file",
    encryptedPayload: mkBlob('{"name":"doc.txt"}'),
    filePayload: mkBlob("encrypted-file-bytes"),
  });

  const opened = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(Buffer.from(opened.filePayload?.payload ?? "", "base64").toString("utf8"), "encrypted-file-bytes");
});

test("integration: capsule open returns CAPSULE_EXPIRED after expiry", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-expired-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    encryptedPayload: mkBlob("x"),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await storage.postgres.query("UPDATE capsules SET expires_at = now() - interval '1 second' WHERE id = $1", [
    created.capsuleId,
  ]);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_EXPIRED",
  );
});

test("integration: capsule open returns CAPSULE_REVOKED after revoke", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-revoked-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    encryptedPayload: mkBlob("x"),
  });

  await capsules.revokeCapsule(created.capsuleId, userId);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_REVOKED",
  );
});

test("integration: capsule open is rate-limited per IP", async (t) => {
  const base = loadConfig();
  const config = {
    ...base,
    capsuleOpenRateLimitPerIp: 1,
    capsuleRateLimitWindowSeconds: 60,
  };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-rl-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    encryptedPayload: mkBlob("x"),
  });

  const requestIp = `ip-${testEntityId()}`;
  await storage.redis.del(`capsule:open:ip:${requestIp}`);

  await capsules.openCapsule(created.capsuleId, requestIp);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, requestIp),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "RATE_LIMITED",
  );
});

test("integration: file capsule open tolerates missing object storage blob", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-missing-blob-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "file",
    encryptedPayload: mkBlob("meta"),
    filePayload: mkBlob("file-bytes"),
  });

  await storage.postgres.query(
    `
      UPDATE capsules
      SET access_policy = jsonb_set(COALESCE(access_policy, '{}'::jsonb), '{fileStorageKey}', to_jsonb('missing-key'::text), true)
      WHERE id = $1
    `,
    [created.capsuleId],
  );

  const opened = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(opened.filePayload, undefined);
});

test("integration: capsule create works on FREE without access settings", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-free-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'FREE' WHERE id = $1", [
    workspaceId,
  ]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    encryptedPayload: mkBlob("x"),
  });
  assert.ok(created.capsuleId);

  await assert.rejects(
    () =>
      capsules.createCapsule(workspaceId, userId, {
        type: "item",
        encryptedPayload: mkBlob("y"),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "FEATURE_NOT_AVAILABLE",
  );
});

test("integration: update resets view count; activate clears past schedule and views", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const email = `capsule-edit-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'ENTERPRISE' WHERE id = $1", [workspaceId]);

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });

  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "text",
    encryptedPayload: mkBlob("edit-payload"),
    encryptedMetadata: mkBlob("edit-metadata"),
    ownerKeyWrap: mkBlob("edit-wrap"),
    maxViews: 3,
  });

  const opened = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(opened.viewCount, 1);

  const ownerDetail = await capsules.getOwnerCapsule(created.capsuleId, userId);
  assert.equal(ownerDetail.viewCount, 1);
  assert.equal(
    Buffer.from(ownerDetail.encryptedPayload.payload, "base64").toString("utf8"),
    "edit-payload",
  );

  const updated = await capsules.updateCapsule(created.capsuleId, userId, {
    type: "text",
    encryptedPayload: mkBlob("edit-payload-2"),
    encryptedMetadata: mkBlob("edit-metadata-2"),
    ownerKeyWrap: mkBlob("edit-wrap"),
    maxViews: 3,
  });
  assert.equal(updated.viewCount, 0);

  const pastActivate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const pastDeactivate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const pastDelete = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await capsules.updateCapsule(created.capsuleId, userId, {
    type: "text",
    encryptedPayload: mkBlob("edit-payload-3"),
    encryptedMetadata: mkBlob("edit-metadata-3"),
    ownerKeyWrap: mkBlob("edit-wrap"),
    maxViews: 3,
    activateAt: pastActivate,
    deactivateAt: pastDeactivate,
    deleteAt: pastDelete,
  });
  await storage.postgres.query("UPDATE capsules SET view_count = 2 WHERE id = $1", [created.capsuleId]);

  const reactivated = await capsules.setCapsuleState(created.capsuleId, userId, "active");
  assert.equal(reactivated.viewCount, 0);
  assert.equal(reactivated.activateAt, null);
  assert.equal(reactivated.deactivateAt, null);
  assert.equal(reactivated.deleteAt, null);
  assert.equal(reactivated.state, "active");
});
