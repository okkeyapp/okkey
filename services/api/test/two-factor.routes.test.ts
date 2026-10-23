import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthStatePayload } from "../src/auth/service.ts";
import { createApiApp } from "../src/app.ts";
import { base32Decode, totpAt } from "../src/crypto/totp-rfc6238.ts";
import type { SessionService } from "../src/session/service.ts";
import type { TwoFactorRepository } from "../src/storage/repositories.ts";
import { TwoFactorService } from "../src/two-factor/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const USER_ID = "user-2fa";
const FIXED = new Date("2026-06-15T12:00:00.000Z");

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

function memoryRedis() {
  const values = new Map<string, { value: string; expiresAt: number }>();
  const counters = new Map<string, number>();
  return {
    async setWithTtl(key: string, value: string, ttlSeconds: number) {
      values.set(key, { value, expiresAt: FIXED.getTime() + ttlSeconds * 1000 });
    },
    async get(key: string) {
      const row = values.get(key);
      if (!row || FIXED.getTime() >= row.expiresAt) return null;
      return row.value;
    },
    async del(key: string) {
      values.delete(key);
      return counters.delete(key) || values.delete(key) ? 1 : 0;
    },
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire() {
      return true;
    },
  };
}

function memoryTwoFactorRepo(): TwoFactorRepository {
  const totp = new Map<string, Uint8Array>();
  const backups = new Map<string, { hash: string; used: boolean }[]>();
  const exported = new Map<string, Date | null>();
  return {
    async upsertTotpSecret(userId, encrypted) {
      totp.set(userId, Uint8Array.from(encrypted));
    },
    async enableTotpWithFreshBackupCodes(userId, encrypted, hashes) {
      totp.set(userId, Uint8Array.from(encrypted));
      backups.set(userId, hashes.map((hash) => ({ hash, used: false })));
      exported.set(userId, null);
    },
    async disableTotpAndBackupCodes(userId) {
      totp.delete(userId);
      backups.delete(userId);
      exported.delete(userId);
    },
    async getEncryptedTotpSecret(userId) {
      return totp.get(userId) ?? null;
    },
    async deleteTotpForUser(userId) {
      totp.delete(userId);
    },
    async deleteBackupCodesForUser(userId) {
      backups.delete(userId);
    },
    async insertBackupCodes(userId, hashes) {
      const list = backups.get(userId) ?? [];
      for (const hash of hashes) list.push({ hash, used: false });
      backups.set(userId, list);
    },
    async countUnusedBackupCodes(userId) {
      return (backups.get(userId) ?? []).filter((row) => !row.used).length;
    },
    async getLatestBackupCodesCreatedAt(userId) {
      return backups.has(userId) ? FIXED : null;
    },
    async consumeBackupCode(userId, codeHash) {
      const row = (backups.get(userId) ?? []).find((item) => item.hash === codeHash && !item.used);
      if (!row) return false;
      row.used = true;
      return true;
    },
    async replaceBackupCodesOnly(userId, hashes) {
      backups.set(userId, hashes.map((hash) => ({ hash, used: false })));
      exported.set(userId, null);
    },
    async getBackupCodesExportedAt(userId) {
      return exported.get(userId) ?? null;
    },
    async ackBackupCodesExport(userId) {
      if (!totp.has(userId)) return null;
      const at = FIXED;
      exported.set(userId, at);
      return at;
    },
  } as TwoFactorRepository;
}

function createHarness(configOverrides: Parameters<typeof createTestApiConfig>[0] = {}) {
  const enabled = new Map<string, boolean>();
  const states = new Map<string, AuthStatePayload>();
  const issued: string[] = [];
  const users = {
    async findById(id: string) {
      if (id !== USER_ID) return null;
      return {
        id,
        email: "user@example.com",
        publicKey: "pk",
        locale: "en",
        createdAt: FIXED.toISOString(),
        updatedAt: FIXED.toISOString(),
      };
    },
    async isTwoFactorEnabled(id: string) {
      return enabled.get(id) === true;
    },
    async setTwoFactorEnabled(id: string, on: boolean) {
      enabled.set(id, on);
    },
  };
  const config = createTestApiConfig({
    allowHeaderUserIdAuth: false,
    twoFactorBackupCodesCount: 2,
    twoFactorVerifyMaxAttemptsPerState: 2,
    ...configOverrides,
  });
  const service = new TwoFactorService({
    redis: memoryRedis(),
    twoFactorRepo: memoryTwoFactorRepo(),
    users: users as never,
    authService: {
      async readAuthState(id: string) {
        return states.get(id) ?? null;
      },
      async removeAuthState(id: string) {
        states.delete(id);
      },
    },
    sessionService: {
      async createSession(userId: string) {
        const accessToken = `session-${userId}-${issued.length + 1}`;
        issued.push(accessToken);
        return { accessToken, expiresAt: "2099-01-01T00:00:00.000Z" };
      },
    } as unknown as SessionService,
    config,
    now: () => FIXED,
  });
  const app = createApiApp(config, {
    info() {},
    warn() {},
    error() {},
  }, {
    twoFactorService: service,
    sessionService: {
      async resolveAccessToken(token: string) {
        return token === "good-token" ? { userId: USER_ID } : null;
      },
    } as unknown as SessionService,
  });
  return { app, states, issued, users };
}

async function call(
  app: ReturnType<typeof createApiApp>,
  input: { method: string; url: string; body?: unknown; auth?: boolean; ip?: string },
) {
  const headers: Record<string, string> = {};
  if (input.auth) headers.authorization = "Bearer good-token";
  if (input.ip) headers["x-forwarded-for"] = input.ip;
  const req = {
    method: input.method,
    url: input.url,
    headers,
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

function bodyOf(res: MockResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
}

function totpCode(secretBase32: string): string {
  return totpAt(base32Decode(secretBase32), Math.floor(FIXED.getTime() / 1000), 30, 6);
}

async function enroll(app: ReturnType<typeof createApiApp>) {
  const start = await call(app, { method: "POST", url: "/auth/two-factor/totp/enroll/start", auth: true });
  assert.equal(start.statusCode, 200);
  const started = bodyOf(start) as { enrollmentId: string; secretBase32: string };
  const confirm = await call(app, {
    method: "POST",
    url: "/auth/two-factor/totp/enroll/confirm",
    auth: true,
    body: { enrollmentId: started.enrollmentId, code: totpCode(started.secretBase32) },
  });
  assert.equal(confirm.statusCode, 200);
  return {
    secretBase32: started.secretBase32,
    backupCodes: (bodyOf(confirm).backupCodes as string[]) ?? [],
  };
}

test("2FA account routes require auth (QA web 4.3, 12.3)", async () => {
  const { app } = createHarness();
  const routes: Array<{ method: string; url: string; body?: unknown }> = [
    { method: "GET", url: "/auth/two-factor/status" },
    { method: "POST", url: "/auth/two-factor/totp/enroll/start" },
    {
      method: "POST",
      url: "/auth/two-factor/totp/enroll/confirm",
      body: { enrollmentId: "missing", code: "000000" },
    },
    {
      method: "POST",
      url: "/auth/two-factor/backup-codes/regenerate",
      body: { totpCode: "000000" },
    },
    { method: "POST", url: "/auth/two-factor/backup-codes/ack-export" },
    { method: "POST", url: "/auth/two-factor/disable", body: { totpCode: "000000" } },
  ];
  for (const route of routes) {
    const res = await call(app, { method: route.method, url: route.url, body: route.body ?? {} });
    assert.equal(res.statusCode, 401, route.url);
    assert.equal(bodyOf(res).error, "AUTH_REQUIRED");
  }
});

test("enabling 2FA requires a correct 6-digit code (QA web 4.3)", async () => {
  const { app } = createHarness();
  const start = await call(app, { method: "POST", url: "/auth/two-factor/totp/enroll/start", auth: true });
  const started = bodyOf(start) as { enrollmentId: string; secretBase32: string };
  const wrong = await call(app, {
    method: "POST",
    url: "/auth/two-factor/totp/enroll/confirm",
    auth: true,
    body: { enrollmentId: started.enrollmentId, code: "000000" },
  });
  assert.equal(wrong.statusCode, 400);
  assert.equal(bodyOf(wrong).error, "TWO_FACTOR_INVALID_CODE");
  const status = bodyOf(await call(app, { method: "GET", url: "/auth/two-factor/status", auth: true }));
  assert.equal(status.enabled, false);

  const ok = await call(app, {
    method: "POST",
    url: "/auth/two-factor/totp/enroll/confirm",
    auth: true,
    body: { enrollmentId: started.enrollmentId, code: totpCode(started.secretBase32) },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(
    bodyOf(await call(app, { method: "GET", url: "/auth/two-factor/status", auth: true })).enabled,
    true,
  );
});

test("session bootstrap refuses a pending second factor and issues no secrets beyond the session (QA web 12.3)", async () => {
  const { app, states } = createHarness();
  states.set("pending", {
    id: "pending",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const blocked = await call(app, {
    method: "POST",
    url: "/auth/session/bootstrap",
    body: { authStateId: "pending" },
  });
  assert.equal(blocked.statusCode, 400);
  assert.equal(bodyOf(blocked).error, "TWO_FACTOR_REQUIRED");
  assert.equal(blocked.body.includes("access_token"), false);

  states.set("ready", {
    id: "ready",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: false,
  });
  const ready = await call(app, {
    method: "POST",
    url: "/auth/session/bootstrap",
    body: { authStateId: "ready" },
  });
  assert.equal(ready.statusCode, 200);
  const payload = bodyOf(ready);
  assert.deepEqual(Object.keys(payload).sort(), ["access_token", "expires_at", "token_type", "user_id"]);
  assert.equal(payload.user_id, USER_ID);
  assert.equal(payload.token_type, "Bearer");
  assert.equal(typeof payload.access_token, "string");
});

test("verify without a correct second factor issues no session; a backup code is single-use (QA web 4.3, 12.3)", async () => {
  const { app, states, issued } = createHarness();
  const { backupCodes } = await enroll(app);
  states.set("login-1", {
    id: "login-1",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const wrong = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "login-1", code: "000000" },
  });
  assert.equal(wrong.statusCode, 400);
  assert.equal(bodyOf(wrong).error, "TWO_FACTOR_INVALID_CODE");
  assert.equal(issued.length, 0);

  const first = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "login-1", code: backupCodes[0] },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(typeof bodyOf(first).access_token, "string");

  states.set("login-2", {
    id: "login-2",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const reuse = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "login-2", code: backupCodes[0] },
  });
  assert.equal(reuse.statusCode, 400);
  assert.equal(bodyOf(reuse).error, "TWO_FACTOR_BACKUP_INVALID");
  assert.equal(reuse.body.includes("access_token"), false);
});

test("regenerating backup codes invalidates the previous codes (QA web 4.3)", async () => {
  const { app, states } = createHarness();
  const { secretBase32, backupCodes } = await enroll(app);
  const regenerated = await call(app, {
    method: "POST",
    url: "/auth/two-factor/backup-codes/regenerate",
    auth: true,
    body: { totpCode: totpCode(secretBase32) },
  });
  assert.equal(regenerated.statusCode, 200);
  const nextCodes = bodyOf(regenerated).backupCodes as string[];
  assert.equal(nextCodes.includes(backupCodes[0]!), false);

  states.set("old-code", {
    id: "old-code",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const rejected = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "old-code", code: backupCodes[0] },
  });
  assert.equal(rejected.statusCode, 400);

  states.set("new-code", {
    id: "new-code",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const accepted = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "new-code", code: nextCodes[0] },
  });
  assert.equal(accepted.statusCode, 200);
});

test("disable without a valid code fails; after disable login no longer needs 2FA (QA web 4.3)", async () => {
  const { app, states, users } = createHarness();
  const { secretBase32 } = await enroll(app);
  const denied = await call(app, {
    method: "POST",
    url: "/auth/two-factor/disable",
    auth: true,
    body: {},
  });
  assert.equal(denied.statusCode, 400);
  assert.equal(bodyOf(denied).error, "TWO_FACTOR_SETUP_INVALID");
  assert.equal(await users.isTwoFactorEnabled(USER_ID), true);

  const disabled = await call(app, {
    method: "POST",
    url: "/auth/two-factor/disable",
    auth: true,
    body: { totpCode: totpCode(secretBase32) },
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(await users.isTwoFactorEnabled(USER_ID), false);
  assert.equal(
    bodyOf(await call(app, { method: "GET", url: "/auth/two-factor/status", auth: true })).enabled,
    false,
  );

  states.set("after-disable", {
    id: "after-disable",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: false,
  });
  const session = await call(app, {
    method: "POST",
    url: "/auth/session/bootstrap",
    body: { authStateId: "after-disable" },
  });
  assert.equal(session.statusCode, 200);
  assert.equal(bodyOf(session).error, undefined);
  assert.equal(typeof bodyOf(session).access_token, "string");
});

test("verify is rate-limited (QA web 12.3)", async () => {
  const { app, states } = createHarness({ authRateLimitTwoFactorVerifyPerIp: 1 });
  await enroll(app);
  states.set("rate-1", {
    id: "rate-1",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  const first = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "rate-1", code: "000000" },
  });
  assert.equal(first.statusCode, 400);
  const limited = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    body: { authStateId: "rate-1", code: "000000" },
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(bodyOf(limited).error, "AUTH_RATE_LIMITED");
});

test("repeated wrong codes for one login are rejected (QA web 12.3)", async () => {
  const { app, states } = createHarness({ twoFactorVerifyMaxAttemptsPerState: 2 });
  await enroll(app);
  states.set("attempts", {
    id: "attempts",
    email: "user@example.com",
    userId: USER_ID,
    createdAt: FIXED.toISOString(),
    pendingTwoFactor: true,
  });
  for (let i = 0; i < 2; i += 1) {
    const res = await call(app, {
      method: "POST",
      url: "/auth/two-factor/verify",
      ip: `10.0.0.${i + 1}`,
      body: { authStateId: "attempts", code: "000000" },
    });
    assert.equal(res.statusCode, 400);
  }
  const exceeded = await call(app, {
    method: "POST",
    url: "/auth/two-factor/verify",
    ip: "10.0.0.9",
    body: { authStateId: "attempts", code: "000000" },
  });
  assert.equal(exceeded.statusCode, 429);
  assert.equal(bodyOf(exceeded).error, "TWO_FACTOR_ATTEMPTS_EXCEEDED");
});
