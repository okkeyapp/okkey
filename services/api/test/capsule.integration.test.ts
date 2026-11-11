import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import test from "node:test";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import {
  createCapsuleCreateRoute,
  createCapsuleDeleteRoute,
  createCapsuleOpenRoute,
  createCapsuleOwnerDetailRoute,
  createCapsuleUpdateRoute,
} from "../src/routes/capsules.ts";
import {
  registerCapsuleAccessSettingsProvider,
  resetCapsuleAccessSettingsProviderForTests,
} from "../src/capsule/access-settings-provider.ts";
import { loadConfig } from "../src/config.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import {
  applyMigrations,
  cleanupUserData,
  registerUser,
} from "./two-factor-test-helpers.ts";

function registerPassthroughAccess(t: { after: (fn: () => void) => void }) {
  registerCapsuleAccessSettingsProvider({
    prepareWrite: async ({ input }) => ({
      accessPolicy: {},
      activateAt: input.activateAt ?? null,
      deactivateAt: input.deactivateAt ?? input.expiresAt ?? null,
      deleteAt: input.deleteAt ?? null,
      maxViews: input.maxViews ?? null,
      viewLimitAction: input.viewLimitAction === "delete" ? "delete" : "deactivate",
      passwordAttemptLimit: null,
      approvalRequired: Boolean(input.approvalRequired),
    }),
    assertOpen: async () => ({ approvalRequestId: null }),
  });
  t.after(() => {
    resetCapsuleAccessSettingsProviderForTests();
  });
}

function mkBlob(input: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(input).toString("base64"),
    meta: {},
  };
}

test("integration: capsule create/open with password and view limit", async (t) => {
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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

  const createdWithoutProvider = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    keyTransportMode: "fragment",
    encryptedPayload: mkBlob("capsule-ciphertext"),
    password: "12345",
    passwordAttemptLimit: 3,
  });
  assert.equal(createdWithoutProvider.passwordRequired, true);
  assert.equal(createdWithoutProvider.passwordAttemptLimit, 3);

  const { registerCapsuleAccessSettingsProvider, resetCapsuleAccessSettingsProviderForTests } =
    await import("../src/capsule/access-settings-provider.ts");
  t.after(() => {
    resetCapsuleAccessSettingsProviderForTests();
  });
  registerCapsuleAccessSettingsProvider({
    prepareWrite: async () => ({
      accessPolicy: { password: { kdf: "scrypt-v1", salt: "salt", hash: "hash" } },
      activateAt: null,
      deactivateAt: null,
      deleteAt: null,
      maxViews: 1,
      viewLimitAction: "deactivate",
      passwordAttemptLimit: 3,
      approvalRequired: false,
    }),
    assertOpen: async (input) => {
      if (input.password !== "12345") {
        throw new CapsuleServiceError("CAPSULE_PASSWORD_INVALID", 403, "password invalid");
      }
      if (input.recipientEmail !== "recipient@okkey.local") {
        throw new CapsuleServiceError("CAPSULE_RECIPIENT_FORBIDDEN", 403, "recipient is not allowed");
      }
      return { approvalRequestId: null };
    },
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
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1", "bad-password"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_PASSWORD_INVALID",
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
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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

  registerPassthroughAccess(t);
  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "item",
    encryptedPayload: mkBlob("x"),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await storage.postgres.query(
    "UPDATE capsules SET expires_at = now() - interval '1 second', deactivate_at = now() - interval '1 second' WHERE id = $1",
    [created.capsuleId],
  );

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1"),
    (err: unknown) =>
      err instanceof CapsuleServiceError &&
      (err.code === "CAPSULE_EXPIRED" || err.code === "CAPSULE_INACTIVE"),
  );
});

test("integration: capsule open returns CAPSULE_REVOKED after revoke", async (t) => {
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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
  const base = { ...loadConfig(), deploymentMode: "saas" as const };
  const config = {
    ...base,
    capsuleOpenRateLimitPerIp: 1,
    capsuleRateLimitWindowSeconds: 60,
  };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
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

  registerPassthroughAccess(t);
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

  const metadata = await capsules.getCapsuleMetadata(created.capsuleId);
  assert.equal(metadata.state, "active");
  const reopened = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(reopened.viewCount, 1);
});

test("integration: deactivate then activate restores public access after view limit", async (t) => {
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);

  const email = `capsule-reactivate-${testEntityId()}@okkey.local`;
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

  registerPassthroughAccess(t);
  const created = await capsules.createCapsule(workspaceId, userId, {
    type: "text",
    encryptedPayload: mkBlob("limit-payload"),
    encryptedMetadata: mkBlob("limit-metadata"),
    ownerKeyWrap: mkBlob("limit-wrap"),
    maxViews: 1,
  });

  const firstOpen = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(firstOpen.viewCount, 1);

  await assert.rejects(
    () => capsules.openCapsule(created.capsuleId, "127.0.0.1"),
    (err: unknown) => err instanceof CapsuleServiceError && err.code === "CAPSULE_VIEW_LIMIT_EXCEEDED",
  );

  const limitedMetadata = await capsules.getCapsuleMetadata(created.capsuleId);
  assert.equal(limitedMetadata.state, "inactive");
  assert.equal(limitedMetadata.viewCount, 1);

  await capsules.setCapsuleState(created.capsuleId, userId, "inactive");
  const reactivated = await capsules.setCapsuleState(created.capsuleId, userId, "active");
  assert.equal(reactivated.state, "active");
  assert.equal(reactivated.viewCount, 0);

  const metadata = await capsules.getCapsuleMetadata(created.capsuleId);
  assert.equal(metadata.state, "active");
  const secondOpen = await capsules.openCapsule(created.capsuleId, "127.0.0.1");
  assert.equal(secondOpen.viewCount, 1);
});

function hashCapsulePassword(password: string, saltBase64: string, secret: string): string {
  const salt = Buffer.from(saltBase64, "base64");
  const derived = scryptSync(
    password,
    Buffer.concat([salt, createHash("sha256").update(secret).digest()]),
    32,
  );
  return Buffer.from(derived).toString("base64");
}

class CapsuleHttpResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

test("integration: password capsule stays usable after downgrade and paid edits are rejected", async (t) => {
  const config = { ...loadConfig(), deploymentMode: "saas" as const };
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);

  const email = `capsule-downgrade-${testEntityId()}@okkey.local`;
  t.after(async () => {
    resetCapsuleAccessSettingsProviderForTests();
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
  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'TEAM' WHERE id = $1", [workspaceId]);

  registerCapsuleAccessSettingsProvider({
    prepareWrite: async ({ input, sessionSecret }) => {
      const password = input.password ?? "";
      if (password.length < 4) {
        throw new CapsuleServiceError("CAPSULE_BAD_REQUEST", 400, "password must be at least 4 characters");
      }
      const salt = randomBytes(16).toString("base64");
      return {
        accessPolicy: {
          password: { kdf: "scrypt-v1", salt, hash: hashCapsulePassword(password, salt, sessionSecret) },
        },
        activateAt: null,
        deactivateAt: null,
        deleteAt: null,
        maxViews: null,
        viewLimitAction: "deactivate",
        passwordAttemptLimit: input.passwordAttemptLimit ?? 3,
        // Omitted on purpose: core must store false rather than fail the insert.
        approvalRequired: undefined as unknown as boolean,
      };
    },
    assertOpen: async ({ capsule, password, sessionSecret }) => {
      const policy = capsule.accessPolicy as { password?: { salt?: string; hash?: string } } | null;
      const stored = policy?.password;
      if (!stored?.hash || !stored.salt) {
        return { approvalRequestId: null };
      }
      if (!password) {
        throw new CapsuleServiceError("CAPSULE_PASSWORD_REQUIRED", 401, "password required");
      }
      const actual = Buffer.from(hashCapsulePassword(password, stored.salt, sessionSecret), "base64");
      const expected = Buffer.from(stored.hash, "base64");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new CapsuleServiceError("CAPSULE_PASSWORD_INVALID", 403, "password invalid");
      }
      return { approvalRequestId: null };
    },
  });

  const capsules = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    objectStorage: storage.objectStorage,
    config,
  });
  const resolveUserId = async () => userId;
  const routes = {
    POST: createCapsuleCreateRoute(capsules, resolveUserId),
    GET: createCapsuleOwnerDetailRoute(capsules, resolveUserId),
    OPEN: createCapsuleOpenRoute(capsules, resolveUserId),
    PUT: createCapsuleUpdateRoute(capsules, resolveUserId),
    DELETE: createCapsuleDeleteRoute(capsules, resolveUserId),
  };
  const dispatch = async (
    route: (typeof routes)[keyof typeof routes],
    url: string,
    params: Record<string, string>,
    body?: unknown,
  ) => {
    const res = new CapsuleHttpResponse();
    await route({
      req: {
        method: "POST",
        url,
        headers: { "x-user-id": userId },
        socket: { remoteAddress: "127.0.0.1" },
        ...(body !== undefined ? { body } : {}),
      } as IncomingMessage,
      res: res as unknown as ServerResponse,
      params,
      requestId: "capsule-downgrade",
    });
    return { status: res.statusCode, json: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {} };
  };

  const created = await dispatch(routes.POST, `/workspaces/${workspaceId}/capsules`, { workspaceId }, {
    type: "text",
    encryptedPayload: mkBlob("secret"),
    encryptedMetadata: mkBlob("meta"),
    ownerKeyWrap: mkBlob("wrap"),
    keyTransportMode: "fragment",
    password: "capsule-secret",
    passwordAttemptLimit: "3",
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.passwordRequired, true);
  assert.equal(created.json.passwordAttemptLimit, 3);
  const capsuleId = created.json.capsuleId;
  assert.equal(typeof capsuleId, "string");

  await storage.postgres.query("UPDATE workspaces SET plan_tier = 'FREE' WHERE id = $1", [workspaceId]);

  const detail = await dispatch(routes.GET, `/capsules/${capsuleId}/owner`, { capsuleId: String(capsuleId) });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.passwordRequired, true);

  const opened = await dispatch(
    routes.OPEN,
    `/capsules/${capsuleId}/open`,
    { capsuleId: String(capsuleId) },
    { password: "capsule-secret", keyTransportMode: "fragment" },
  );
  assert.equal(opened.status, 200);
  assert.equal(opened.json.passwordRequired, true);

  const changed = await dispatch(
    routes.PUT,
    `/capsules/${capsuleId}`,
    { capsuleId: String(capsuleId) },
    {
      type: "text",
      encryptedPayload: mkBlob("secret-2"),
      encryptedMetadata: mkBlob("meta-2"),
      ownerKeyWrap: mkBlob("wrap"),
      keyTransportMode: "fragment",
      password: "another-secret",
      passwordAttemptLimit: 3,
    },
  );
  assert.equal(changed.status, 403);
  assert.equal(changed.json.error, "FEATURE_NOT_AVAILABLE");

  const deleted = await dispatch(routes.DELETE, `/capsules/${capsuleId}`, { capsuleId: String(capsuleId) });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.deleted, true);
});
