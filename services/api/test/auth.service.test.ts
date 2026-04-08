import test from "node:test";
import assert from "node:assert/strict";
import { AuthError, AuthService } from "../src/auth/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly expirations = new Map<string, number>();
  private readonly counters = new Map<string, number>();
  private nowMs = Date.now();

  setNow(ms: number): void {
    this.nowMs = ms;
  }

  now(): Date {
    return new Date(this.nowMs);
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
    this.expirations.set(key, this.nowMs + ttlSeconds * 1000);
  }

  async get(key: string): Promise<string | null> {
    this.purgeIfExpired(key);
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key);
    this.expirations.delete(key);
    this.counters.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    this.purgeIfExpired(key);
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.expirations.set(key, this.nowMs + seconds * 1000);
    return true;
  }

  private purgeIfExpired(key: string): void {
    const expiresAt = this.expirations.get(key);
    if (expiresAt !== undefined && this.nowMs > expiresAt) {
      this.values.delete(key);
      this.expirations.delete(key);
      this.counters.delete(key);
    }
  }
}

const baseConfig: ApiConfig = createTestApiConfig();

function setupAuthService(params?: {
  configOverrides?: Partial<ApiConfig>;
  existingUser?: boolean;
  twoFactorEnabledForExisting?: boolean;
  generatedCode?: string;
}) {
  const redis = new InMemoryRedis();
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));

  const sentEmails: Array<{ to: string; code: string; locale?: string }> = [];
  const config = { ...baseConfig, ...(params?.configOverrides ?? {}) };
  const generatedCode = params?.generatedCode ?? "123456";

  let nextId = 1;
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async (email: string) =>
        params?.existingUser
          ? {
              id: "u1",
              email,
              publicKey: "pk",
              locale: null,
              createdAt: redis.now().toISOString(),
              updatedAt: redis.now().toISOString(),
            }
          : null,
      isTwoFactorEnabled: async (userId: string) =>
        Boolean(
          params?.existingUser &&
            params?.twoFactorEnabledForExisting &&
            userId === "u1",
        ),
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sentEmails.push({
          to: input.to,
          code: input.variables.code,
          locale: input.localeHints.explicitLocale,
        });
      },
    },
    config,
    now: () => redis.now(),
    generateCode: () => generatedCode,
    generateId: () => `id-${nextId++}`,
  });

  return { service, sentEmails, redis };
}

test("startEmailLogin sends normalized email and 6-digit code", async () => {
  const { service, sentEmails } = setupAuthService({ generatedCode: "654321" });

  const result = await service.startEmailLogin({
    email: "User@Example.com",
    locale: "ru",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.challengeId, "id-1");
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "user@example.com");
  assert.equal(sentEmails[0].code, "654321");
});

test("startEmailLogin reuses active challenge for same email without sending again", async () => {
  const { service, sentEmails } = setupAuthService({ generatedCode: "111000" });

  const first = await service.startEmailLogin({
    email: "reuse@example.com",
    requestIp: "127.0.0.1",
  });
  assert.equal(sentEmails.length, 1);

  const second = await service.startEmailLogin({
    email: "reuse@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(second.challengeId, first.challengeId);
  assert.equal(second.expiresAt, first.expiresAt);
  assert.equal(second.resendAvailableAt, first.resendAvailableAt);
  assert.equal(sentEmails.length, 1);
});

test("resendEmailCode blocks resend before cooldown", async () => {
  const { service } = setupAuthService();
  const start = await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  await assert.rejects(
    () =>
      service.resendEmailCode({
        challengeId: start.challengeId,
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "AUTH_RESEND_TOO_EARLY",
  );
});

test("confirmEmailCode returns registration for unknown user", async () => {
  const { service } = setupAuthService({ generatedCode: "111222" });
  const start = await service.startEmailLogin({
    email: "new@example.com",
    requestIp: "127.0.0.1",
  });

  const result = await service.confirmEmailCode({
    challengeId: start.challengeId,
    code: "111222",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.userExists, false);
  assert.equal(result.nextStep, "registration");
});

test("confirmEmailCode returns two_factor when 2FA enabled", async () => {
  const { service } = setupAuthService({
    existingUser: true,
    twoFactorEnabledForExisting: true,
    generatedCode: "333444",
  });
  const start = await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  const result = await service.confirmEmailCode({
    challengeId: start.challengeId,
    code: "333444",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.userExists, true);
  assert.equal(result.nextStep, "two_factor");
});

test("confirmEmailCode returns device_check for existing user", async () => {
  const { service } = setupAuthService({
    existingUser: true,
    generatedCode: "333444",
  });
  const start = await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  const result = await service.confirmEmailCode({
    challengeId: start.challengeId,
    code: "333444",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.userExists, true);
  assert.equal(result.nextStep, "device_check");
});

test("confirmEmailCode enforces max attempts", async () => {
  const { service } = setupAuthService({
    configOverrides: { authCodeMaxAttempts: 2 },
    generatedCode: "999000",
  });
  const start = await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  await assert.rejects(
    () =>
      service.confirmEmailCode({
        challengeId: start.challengeId,
        code: "000000",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) => error instanceof AuthError && error.code === "AUTH_CODE_INVALID",
  );

  await assert.rejects(
    () =>
      service.confirmEmailCode({
        challengeId: start.challengeId,
        code: "111111",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof AuthError &&
      error.code === "AUTH_CODE_ATTEMPTS_EXCEEDED",
  );
});

test("startEmailLogin enforces email rate limit", async () => {
  const { service, redis } = setupAuthService({
    configOverrides: {
      authRateLimitStartPerEmail: 1,
      authRateLimitStartPerIp: 10,
      authCodeTtlSeconds: 300,
    },
  });

  const t0 = redis.now().getTime();

  await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  redis.setNow(t0 + 400_000);
  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "user@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) => error instanceof AuthError && error.code === "AUTH_RATE_LIMITED",
  );
});
