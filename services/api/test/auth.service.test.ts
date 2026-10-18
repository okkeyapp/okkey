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

  async setIfNotExistsWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.purgeIfExpired(key);
    if (this.values.has(key)) {
      return false;
    }
    this.values.set(key, value);
    this.expirations.set(key, this.nowMs + ttlSeconds * 1000);
    return true;
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
  /** When false, mimics fresh self-host install (zero users). Default: true (SaaS / subsequent users). */
  hasAnyUsers?: boolean;
  twoFactorEnabledForExisting?: boolean;
  generatedCode?: string;
}) {
  const redis = new InMemoryRedis();
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));

  const sentEmails: Array<{ to: string; code: string; locale?: string }> = [];
  const config = { ...baseConfig, ...(params?.configOverrides ?? {}) };
  const generatedCode = params?.generatedCode ?? "123456";
  const hasAnyUsers = params?.hasAnyUsers ?? true;

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
      hasAnyUsers: async () => hasAnyUsers,
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
  assert.equal(result.bootstrapRequired, undefined);
});

test("createCode honors AUTH_E2E_FIXED_CODE outside prod", async () => {
  const prevCode = process.env.AUTH_E2E_FIXED_CODE;
  const prevDeploy = process.env.DEPLOY_ENV;
  process.env.AUTH_E2E_FIXED_CODE = "424242";
  process.env.DEPLOY_ENV = "dev";
  try {
    const redis = new InMemoryRedis();
    redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));
    const sentEmails: Array<{ to: string; code: string }> = [];
    const service = new AuthService({
      redis,
      users: {
        findByEmail: async () => null,
        isTwoFactorEnabled: async () => false,
        hasAnyUsers: async () => true,
      },
      emailTemplates: {
        sendAuthEmailCode: async (input) => {
          sentEmails.push({ to: input.to, code: input.variables.code });
        },
      },
      config: baseConfig,
      now: () => redis.now(),
      // Intentionally omit generateCode so default createCode() runs.
      generateId: () => "id-fixed",
    });
    await service.startEmailLogin({ email: "fixed@okkey.local", requestIp: "127.0.0.1" });
    assert.equal(sentEmails[0]?.code, "424242");
  } finally {
    if (prevCode === undefined) delete process.env.AUTH_E2E_FIXED_CODE;
    else process.env.AUTH_E2E_FIXED_CODE = prevCode;
    if (prevDeploy === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = prevDeploy;
  }
});

test("createCode ignores AUTH_E2E_FIXED_CODE in prod", async () => {
  const prevCode = process.env.AUTH_E2E_FIXED_CODE;
  const prevDeploy = process.env.DEPLOY_ENV;
  process.env.AUTH_E2E_FIXED_CODE = "424242";
  process.env.DEPLOY_ENV = "prod";
  try {
    const redis = new InMemoryRedis();
    redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));
    const sentEmails: Array<{ to: string; code: string }> = [];
    const service = new AuthService({
      redis,
      users: {
        findByEmail: async () => null,
        isTwoFactorEnabled: async () => false,
        hasAnyUsers: async () => true,
      },
      emailTemplates: {
        sendAuthEmailCode: async (input) => {
          sentEmails.push({ to: input.to, code: input.variables.code });
        },
      },
      config: baseConfig,
      now: () => redis.now(),
      generateId: () => "id-prod",
    });
    await service.startEmailLogin({ email: "prod@okkey.local", requestIp: "127.0.0.1" });
    assert.notEqual(sentEmails[0]?.code, "424242");
    assert.match(sentEmails[0]?.code ?? "", /^\d{6}$/);
  } finally {
    if (prevCode === undefined) delete process.env.AUTH_E2E_FIXED_CODE;
    else process.env.AUTH_E2E_FIXED_CODE = prevCode;
    if (prevDeploy === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = prevDeploy;
  }
});

test("startEmailLogin first-run (empty DB, self_hosted) skips OTP and returns bootstrapRequired", async () => {
  const { service, sentEmails, redis } = setupAuthService({ hasAnyUsers: false });

  const result = await service.startEmailLogin({
    email: "Admin@Example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.bootstrapRequired, true);
  assert.equal(result.nextStep, "registration");
  assert.ok(result.authStateId);
  assert.equal(result.challengeId, "");
  assert.equal(sentEmails.length, 0);

  const raw = await redis.get(`auth:state:${result.authStateId}`);
  assert.ok(raw);
  const state = JSON.parse(raw) as { email: string; userId: string | null };
  assert.equal(state.email, "admin@example.com");
  assert.equal(state.userId, null);
  assert.equal(await redis.get("auth:bootstrap:first-user"), "admin@example.com");
});

test("startEmailLogin empty catalog on saas still requires email OTP", async () => {
  const { service, sentEmails } = setupAuthService({
    hasAnyUsers: false,
    configOverrides: { deploymentMode: "saas" },
  });

  const result = await service.startEmailLogin({
    email: "first@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.bootstrapRequired, undefined);
  assert.ok(result.challengeId);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "first@example.com");
});

test("startEmailLogin first-run claim is idempotent for the same email", async () => {
  const { service, sentEmails } = setupAuthService({ hasAnyUsers: false });

  const first = await service.startEmailLogin({
    email: "admin@example.com",
    requestIp: "127.0.0.1",
  });
  const second = await service.startEmailLogin({
    email: "admin@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(first.bootstrapRequired, true);
  assert.equal(second.bootstrapRequired, true);
  assert.ok(second.authStateId);
  assert.notEqual(second.authStateId, first.authStateId);
  assert.equal(sentEmails.length, 0);
});

test("startEmailLogin second empty-catalog email requires OTP while claim is held", async () => {
  const { service, sentEmails } = setupAuthService({ hasAnyUsers: false });

  const first = await service.startEmailLogin({
    email: "admin@example.com",
    requestIp: "127.0.0.1",
  });
  const second = await service.startEmailLogin({
    email: "other@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(first.bootstrapRequired, true);
  assert.equal(second.bootstrapRequired, undefined);
  assert.ok(second.challengeId);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "other@example.com");
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

test("startEmailLogin mints a new challenge when remaining TTL is low", async () => {
  const { service, sentEmails, redis } = setupAuthService({
    generatedCode: "222000",
    configOverrides: {
      authCodeTtlSeconds: 300,
      authResendCooldownSeconds: 60,
    },
  });

  const first = await service.startEmailLogin({
    email: "near-expiry@example.com",
    requestIp: "127.0.0.1",
  });
  assert.equal(sentEmails.length, 1);
  assert.equal(first.challengeId, "id-1");

  // Leave ~15s of TTL — below reuse threshold (authResendCooldownSeconds).
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0) + (300 - 15) * 1000);

  const second = await service.startEmailLogin({
    email: "near-expiry@example.com",
    requestIp: "127.0.0.1",
  });

  assert.notEqual(second.challengeId, first.challengeId);
  assert.equal(second.challengeId, "id-2");
  assert.equal(sentEmails.length, 2);
  assert.ok(new Date(second.expiresAt).getTime() > new Date(first.expiresAt).getTime());
});

test("startEmailLogin still reuses when remaining TTL is above cooldown", async () => {
  const { service, sentEmails, redis } = setupAuthService({
    generatedCode: "333000",
    configOverrides: {
      authCodeTtlSeconds: 300,
      authResendCooldownSeconds: 60,
    },
  });

  const first = await service.startEmailLogin({
    email: "still-fresh@example.com",
    requestIp: "127.0.0.1",
  });

  // 61s remaining → still above reuse threshold.
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0) + (300 - 61) * 1000);

  const second = await service.startEmailLogin({
    email: "still-fresh@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(second.challengeId, first.challengeId);
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
