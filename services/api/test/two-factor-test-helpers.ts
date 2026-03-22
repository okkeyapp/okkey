import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { base32Decode, totpAt } from "../src/crypto/totp-rfc6238.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));

export function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

export async function applyMigrations(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
): Promise<void> {
  const migration0002 = readFileSync(
    path.resolve(helpersDir, "../migrations/0002_user_password_kdf.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0002);
  const migration0003 = readFileSync(
    path.resolve(helpersDir, "../migrations/0003_two_factor_sessions.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0003);
  const migration0004 = readFileSync(
    path.resolve(helpersDir, "../migrations/0004_user_locale.sql"),
    "utf8",
  );
  await storage.postgres.query(migration0004);
}

export async function cleanupUserData(
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

export interface RegisteredUser {
  userId: string;
  email: string;
  authStateId: string;
}

export async function registerUser(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  config: ApiConfig,
  email: string,
): Promise<RegisteredUser> {
  const authStateId = randomUUID();
  const emailTemplates = new EmailTemplateService({ send: async () => {} }, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });
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

export function totpCodeForSecret(secretBase32: string, fixed: Date): string {
  const secret = base32Decode(secretBase32);
  const unixSeconds = Math.floor(fixed.getTime() / 1000);
  return totpAt(secret, unixSeconds, 30, 6);
}

/** Lets fire-and-forget `void emailTemplates.send…BestEffort` promises settle in tests. */
export async function flushOutboundEmailTasks(): Promise<void> {
  for (let i = 0; i < 24; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
