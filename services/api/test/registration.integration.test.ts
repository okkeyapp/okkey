import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import { loadConfig } from "../src/config.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationError, RegistrationService } from "../src/registration/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("integration: registration completes user, workspace, vault, trusted device", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  const migration0002 = readFileSync(
    path.resolve(testDir, "../migrations/0002_user_password_kdf.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0002);
  const suffix = randomUUID();
  const email = `reg-${suffix}@okkey.local`;
  const authStateId = randomUUID();

  const emailTemplates = new EmailTemplateService(
    { send: async () => {} },
    config.emailFrom,
    config.defaultEmailLocale,
  );

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });

  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    config,
  });

  t.after(async () => {
    try {
      await storage.postgres.query("DELETE FROM devices WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [
        email,
      ]);
      await storage.postgres.query("DELETE FROM vaults WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1))", [email]);
      await storage.postgres.query("DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1)", [
        email,
      ]);
      await storage.postgres.query("DELETE FROM users WHERE email = $1", [email]);
    } finally {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await storage.close();
    }
  });

  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );

  const share32 = new Uint8Array(32).fill(11);
  const salt16 = new Uint8Array(16).fill(22);
  const encPriv = new Uint8Array(64).fill(33);
  const pkB64 = Buffer.alloc(32, 5).toString("base64");

  const result = await registrationService.completeRegistration({
    authStateId,
    userPublicKey: pkB64,
    encryptedPrivateKey: encPriv,
    serverKeyShare: share32,
    passwordKdfSalt: salt16,
    passwordKdfParamsVersion: 1,
    deviceFingerprint: "a".repeat(64),
    deviceName: "First device",
    devicePublicKey: Buffer.from("device-pk").toString("base64"),
    deviceShare: share32,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.deviceStatus, "trusted");
  assert.match(result.userId, /^[0-9a-f-]{36}$/i);

  const userRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  assert.equal(userRows.length, 1);

  const devRows = await storage.postgres.query<{ status: string }>(
    "SELECT status FROM devices WHERE id = $1",
    [result.deviceId],
  );
  assert.equal(devRows[0]?.status, "trusted");

  const again = await registrationService.completeRegistration({
    authStateId,
    userPublicKey: pkB64,
    encryptedPrivateKey: encPriv,
    serverKeyShare: share32,
    passwordKdfSalt: salt16,
    passwordKdfParamsVersion: 1,
    deviceFingerprint: "a".repeat(64),
    deviceName: "First device",
    devicePublicKey: Buffer.from("device-pk").toString("base64"),
    deviceShare: share32,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
  });
  assert.equal(again.userId, result.userId);
});

test("integration: parallel completeRegistration creates single user", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  const migration0002 = readFileSync(
    path.resolve(testDir, "../migrations/0002_user_password_kdf.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0002);
  const suffix = randomUUID();
  const email = `reg-parallel-${suffix}@okkey.local`;
  const authStateId = randomUUID();

  const emailTemplates = new EmailTemplateService(
    { send: async () => {} },
    config.emailFrom,
    config.defaultEmailLocale,
  );

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });

  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    config,
  });

  t.after(async () => {
    try {
      await storage.postgres.query("DELETE FROM devices WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [
        email,
      ]);
      await storage.postgres.query("DELETE FROM vaults WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1))", [email]);
      await storage.postgres.query("DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1)", [
        email,
      ]);
      await storage.postgres.query("DELETE FROM users WHERE email = $1", [email]);
    } finally {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await storage.close();
    }
  });

  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );

  const share32 = new Uint8Array(32).fill(11);
  const salt16 = new Uint8Array(16).fill(22);
  const encPriv = new Uint8Array(64).fill(33);
  const pkB64 = Buffer.alloc(32, 5).toString("base64");

  const payload = {
    authStateId,
    userPublicKey: pkB64,
    encryptedPrivateKey: encPriv,
    serverKeyShare: share32,
    passwordKdfSalt: salt16,
    passwordKdfParamsVersion: 1,
    deviceFingerprint: "c".repeat(64),
    deviceName: "Parallel device",
    devicePublicKey: Buffer.from("device-pk-p").toString("base64"),
    deviceShare: share32,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
  };

  const [first, second] = await Promise.allSettled([
    registrationService.completeRegistration(payload),
    registrationService.completeRegistration(payload),
  ]);

  const fulfilled = [first, second].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<
    Awaited<ReturnType<RegistrationService["completeRegistration"]>>
  >[];
  const rejected = [first, second].filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  assert.ok(fulfilled.length >= 1, "at least one registration must succeed");
  if (fulfilled.length === 2) {
    assert.equal(fulfilled[0].value.userId, fulfilled[1].value.userId);
  }
  const allowedParallelReject = new Set(["REGISTRATION_CONFLICT", "REGISTRATION_ALREADY_COMPLETED"]);
  for (const r of rejected) {
    assert.ok(r.reason instanceof RegistrationError);
    assert.ok(
      allowedParallelReject.has((r.reason as RegistrationError).code),
      `unexpected rejection: ${(r.reason as RegistrationError).code}`,
    );
  }

  const userRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );
  assert.equal(userRows.length, 1);
});

test("integration: missing auth state returns AUTH_CHALLENGE_EXPIRED", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  const migration0002 = readFileSync(
    path.resolve(testDir, "../migrations/0002_user_password_kdf.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0002);

  const emailTemplates = new EmailTemplateService(
    { send: async () => {} },
    config.emailFrom,
    config.defaultEmailLocale,
  );

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });

  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    config,
  });

  t.after(async () => {
    await storage.close();
  });

  const missingStateId = randomUUID();
  await assert.rejects(
    () =>
      registrationService.completeRegistration({
        authStateId: missingStateId,
        userPublicKey: Buffer.alloc(32, 1).toString("base64"),
        encryptedPrivateKey: new Uint8Array(48).fill(1),
        serverKeyShare: new Uint8Array(32).fill(2),
        passwordKdfSalt: new Uint8Array(16).fill(3),
        passwordKdfParamsVersion: 1,
        deviceFingerprint: "d".repeat(64),
        deviceName: "x",
        devicePublicKey: Buffer.from("pk").toString("base64"),
        deviceShare: new Uint8Array(32).fill(4),
        platform: "desktop",
        osName: "macOS",
        osVersion: "14",
        appVersion: "1.0.0",
        clientType: "desktop",
        userAgent: "test",
        requestIp: "127.0.0.1",
      }),
    (err: unknown) =>
      err instanceof RegistrationError &&
      err.code === "AUTH_CHALLENGE_EXPIRED" &&
      err.statusCode === 410,
  );
});
