import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import { loadConfig, type ApiConfig } from "../src/config.ts";
import { base32Decode, totpAt } from "../src/crypto/totp-rfc6238.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { SessionService } from "../src/session/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { TwoFactorError, TwoFactorService } from "../src/two-factor/service.ts";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

async function applyMigrations(storage: Awaited<ReturnType<typeof createStorageLayer>>): Promise<void> {
  const migration0002 = readFileSync(
    path.resolve(testDir, "../migrations/0002_user_password_kdf.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0002);
  const migration0003 = readFileSync(
    path.resolve(testDir, "../migrations/0003_two_factor_sessions.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0003);
}

async function cleanupUserData(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  email: string,
): Promise<void> {
  await storage.postgres.query(
    "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query(
    "DELETE FROM user_backup_codes WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query(
    "DELETE FROM user_totp_credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query("DELETE FROM devices WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [
    email,
  ]);
  await storage.postgres.query(
    "DELETE FROM vaults WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1))",
    [email],
  );
  await storage.postgres.query("DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1)", [
    email,
  ]);
  await storage.postgres.query("DELETE FROM users WHERE email = $1", [email]);
}

interface RegisteredUser {
  userId: string;
  email: string;
  authStateId: string;
}

async function registerUser(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  config: ApiConfig,
  email: string,
): Promise<RegisteredUser> {
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
    deviceFingerprint: "f".repeat(64),
    deviceName: "2FA test device",
    devicePublicKey: Buffer.from("2fa-dpk").toString("base64"),
    deviceShare: share32,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
  });

  return { userId: result.userId, email, authStateId };
}

function totpCodeForSecret(secretBase32: string, fixed: Date): string {
  const secret = base32Decode(secretBase32);
  const unixSeconds = Math.floor(fixed.getTime() / 1000);
  return totpAt(secret, unixSeconds, 30, 6);
}

test("integration: email-equivalent auth state → TOTP verify → session row", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T10:00:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 4 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-totp-${suffix}@okkey.local`;

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);

  const start = await twoFactor.enrollTotpStart(userId);
  const code = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code,
  });

  const loginStateId = randomUUID();
  await storage.redis.setWithTtl(
    authStateRedisKey(loginStateId),
    JSON.stringify({
      id: loginStateId,
      email,
      userId,
      createdAt: fixed.toISOString(),
      pendingTwoFactor: true,
    }),
    config.authPendingTwoFactorTtlSeconds,
  );

  const verifyTotp = totpCodeForSecret(start.secretBase32, fixed);
  const sessionOut = await twoFactor.verifyTwoFactorAndCreateSession({
    authStateId: loginStateId,
    code: verifyTotp,
    requestIp: "127.0.0.1",
  });

  assert.ok(sessionOut.accessToken.length > 16);
  assert.equal(sessionOut.userId, userId);

  const tokenHash = sessionService.hashAccessToken(sessionOut.accessToken);
  const rows = await storage.postgres.query<{ id: string; device_id: string | null }>(
    "SELECT id, device_id FROM sessions WHERE token_hash = $1",
    [tokenHash],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.device_id, null);

  const stateAfter = await authService.readAuthState(loginStateId);
  assert.equal(stateAfter, null);
});

test("integration: 2FA verify with backup code then reject reuse", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T11:30:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 4 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-backup-${suffix}@okkey.local`;

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const start = await twoFactor.enrollTotpStart(userId);
  const enrollTotp = totpCodeForSecret(start.secretBase32, fixed);
  const { backupCodes } = await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollTotp,
  });
  assert.equal(backupCodes.length, 4);
  const oneBackup = backupCodes[0]!;

  const loginStateId = randomUUID();
  await storage.redis.setWithTtl(
    authStateRedisKey(loginStateId),
    JSON.stringify({
      id: loginStateId,
      email,
      userId,
      createdAt: fixed.toISOString(),
      pendingTwoFactor: true,
    }),
    config.authPendingTwoFactorTtlSeconds,
  );

  await twoFactor.verifyTwoFactorAndCreateSession({
    authStateId: loginStateId,
    code: oneBackup,
    requestIp: "127.0.0.1",
  });

  const loginStateId2 = randomUUID();
  await storage.redis.setWithTtl(
    authStateRedisKey(loginStateId2),
    JSON.stringify({
      id: loginStateId2,
      email,
      userId,
      createdAt: fixed.toISOString(),
      pendingTwoFactor: true,
    }),
    config.authPendingTwoFactorTtlSeconds,
  );

  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: loginStateId2,
        code: oneBackup,
        requestIp: "127.0.0.1",
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_BACKUP_INVALID",
  );
});

test("integration: disable 2FA with TOTP", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T12:00:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 3 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-off-${suffix}@okkey.local`;

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const start = await twoFactor.enrollTotpStart(userId);
  const enrollTotp = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollTotp,
  });
  assert.equal(await storage.repositories.users.isTwoFactorEnabled(userId), true);

  const disableTotp = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.disableTwoFactor(userId, { totpCode: disableTotp });

  assert.equal(await storage.repositories.users.isTwoFactorEnabled(userId), false);
  const totpRow = await storage.repositories.twoFactor.getEncryptedTotpSecret(userId);
  assert.equal(totpRow, null);
});

test("integration: TWO_FACTOR_BACKUP_DEPLETED when no backup codes left", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T13:00:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 1 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-depl-${suffix}@okkey.local`;

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const start = await twoFactor.enrollTotpStart(userId);
  const enrollTotp = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollTotp,
  });

  await storage.postgres.query("DELETE FROM user_backup_codes WHERE user_id = $1::uuid", [userId]);

  const loginStateId = randomUUID();
  await storage.redis.setWithTtl(
    authStateRedisKey(loginStateId),
    JSON.stringify({
      id: loginStateId,
      email,
      userId,
      createdAt: fixed.toISOString(),
      pendingTwoFactor: true,
    }),
    config.authPendingTwoFactorTtlSeconds,
  );

  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: loginStateId,
        code: "ABCD-EFGH-12",
        requestIp: "127.0.0.1",
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_BACKUP_DEPLETED",
  );
});

test("integration: 2FA verify rate limit per auth state", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T14:00:00.000Z");
  const config: ApiConfig = { ...base, twoFactorVerifyMaxAttemptsPerState: 2 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-rl-${suffix}@okkey.local`;
  let loginStateId = "";

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
      if (loginStateId) {
        await storage.redis.del(`2fa:verify:attempts:${loginStateId}`);
      }
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const start = await twoFactor.enrollTotpStart(userId);
  const enrollTotp = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollTotp,
  });

  loginStateId = randomUUID();
  await storage.redis.setWithTtl(
    authStateRedisKey(loginStateId),
    JSON.stringify({
      id: loginStateId,
      email,
      userId,
      createdAt: fixed.toISOString(),
      pendingTwoFactor: true,
    }),
    config.authPendingTwoFactorTtlSeconds,
  );

  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      () =>
        twoFactor.verifyTwoFactorAndCreateSession({
          authStateId: loginStateId,
          code: "000000",
          requestIp: "127.0.0.1",
        }),
      (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_INVALID_CODE",
    );
  }

  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: loginStateId,
        code: "000000",
        requestIp: "127.0.0.1",
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_ATTEMPTS_EXCEEDED",
  );
});

test("integration: 2FA verify rate limit per IP", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-15T15:00:00.000Z");
  const config: ApiConfig = { ...base, authRateLimitTwoFactorVerifyPerIp: 2 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = randomUUID();
  const email = `2fa-ip-${suffix}@okkey.local`;
  /** Stable per run, unique vs other tests / stale Redis (TEST-NET-2, RFC 5737). */
  let h = 0;
  for (let i = 0; i < suffix.length; i++) {
    h = (h * 31 + suffix.charCodeAt(i)) >>> 0;
  }
  const rateLimitIp = `198.51.100.${10 + (h % 240)}`;

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
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const start = await twoFactor.enrollTotpStart(userId);
  const enrollTotp = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollTotp,
  });

  const makeState = async (): Promise<string> => {
    const id = randomUUID();
    await storage.redis.setWithTtl(
      authStateRedisKey(id),
      JSON.stringify({
        id,
        email,
        userId,
        createdAt: fixed.toISOString(),
        pendingTwoFactor: true,
      }),
      config.authPendingTwoFactorTtlSeconds,
    );
    return id;
  };

  const s1 = await makeState();
  const s2 = await makeState();

  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: s1,
        code: "000000",
        requestIp: rateLimitIp,
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_INVALID_CODE",
  );
  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: s2,
        code: "000000",
        requestIp: rateLimitIp,
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "TWO_FACTOR_INVALID_CODE",
  );

  const s3 = await makeState();
  await assert.rejects(
    () =>
      twoFactor.verifyTwoFactorAndCreateSession({
        authStateId: s3,
        code: "000000",
        requestIp: rateLimitIp,
      }),
    (e: unknown) => e instanceof TwoFactorError && e.code === "AUTH_RATE_LIMITED",
  );
});
