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
    const current = this.values.has(key)
      ? Number(this.values.get(key) ?? "0")
      : (this.counters.get(key) ?? 0);
    const next = current + 1;
    this.counters.set(key, next);
    this.values.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.expirations.set(key, this.nowMs + seconds * 1000);
    return true;
  }

  async ttl(key: string): Promise<number> {
    this.purgeIfExpired(key);
    if (!this.values.has(key) && !this.counters.has(key)) {
      return -2;
    }
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.max(0, Math.ceil((expiresAt - this.nowMs) / 1000));
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
  /** Defaults to true so OTP-path unit tests keep sending. */
  emailDeliverable?: boolean;
  resolveRegistrationAllowed?: (email: string) => Promise<boolean>;
  resolveInviteRegistration?: ConstructorParameters<typeof AuthService>[0]["resolveInviteRegistration"];
}) {
  const redis = new InMemoryRedis();
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));

  const sentEmails: Array<{
    to: string;
    code: string;
    locale?: string;
    purpose?: string;
  }> = [];
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
          purpose: input.variables.purpose,
        });
      },
    },
    config,
    // Default tests exercise the OTP path; undeliverable cases override this.
    resolveEmailDeliverable: async () => params?.emailDeliverable ?? true,
    resolveRegistrationAllowed: params?.resolveRegistrationAllowed,
    resolveInviteRegistration: params?.resolveInviteRegistration,
    now: () => redis.now(),
    generateCode: () => generatedCode,
    generateId: () => `id-${nextId++}`,
    generateAuthStateId: () => `auth-state-${nextId++}`,
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
  assert.equal(sentEmails[0].purpose, "registration");
  assert.equal(result.bootstrapRequired, undefined);
});

test("startEmailLogin empty catalog on self_host requires setup when registration blocked", async () => {
  const { service, sentEmails } = setupAuthService({
    hasAnyUsers: false,
    resolveRegistrationAllowed: async () => false,
  });

  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "Admin@Example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SETUP_REQUIRED",
  );
  assert.equal(sentEmails.length, 0);
});

test("claimEmptyCatalogBootstrap is exclusive and idempotent for the same email", async () => {
  const { service, redis } = setupAuthService({ hasAnyUsers: false });

  assert.equal(await service.claimEmptyCatalogBootstrap("Admin@Example.com"), true);
  assert.equal(await service.claimEmptyCatalogBootstrap("admin@example.com"), true);
  assert.equal(await service.claimEmptyCatalogBootstrap("other@example.com"), false);
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
  assert.equal(sentEmails[0].purpose, "registration");
});

test("startEmailLogin second empty-catalog email is blocked when setup is required", async () => {
  const { service, sentEmails } = setupAuthService({
    hasAnyUsers: false,
    resolveRegistrationAllowed: async () => false,
  });

  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "admin@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SETUP_REQUIRED",
  );
  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "other@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SETUP_REQUIRED",
  );
  assert.equal(sentEmails.length, 0);
});

test("startEmailLogin after setup allows OTP for open registration", async () => {
  const { service, sentEmails } = setupAuthService({
    hasAnyUsers: true,
  });

  const second = await service.startEmailLogin({
    email: "other@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(second.bootstrapRequired, undefined);
  assert.ok(second.challengeId);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "other@example.com");
  assert.equal(sentEmails[0].purpose, "registration");
});

test("startEmailLogin uses sign_in purpose for existing users", async () => {
  const { service, sentEmails } = setupAuthService({
    existingUser: true,
    generatedCode: "777888",
  });

  await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].purpose, "sign_in");
});

test("startEmailLogin still queues the code when outbound mail is inactive", async () => {
  const { service, sentEmails } = setupAuthService({
    emailDeliverable: false,
    generatedCode: "999000",
  });

  const result = await service.startEmailLogin({
    email: "nodeliver@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.emailDeliverable, false);
  assert.ok(result.challengeId);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].code, "999000");
  assert.equal(sentEmails[0].to, "nodeliver@example.com");
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

test("resendEmailCode still queues a new code when outbound mail is inactive", async () => {
  const { service, sentEmails, redis } = setupAuthService({
    emailDeliverable: false,
    generatedCode: "999000",
    configOverrides: { authResendCooldownSeconds: 60 },
  });
  const start = await service.startEmailLogin({
    email: "nodeliver@example.com",
    requestIp: "127.0.0.1",
  });
  assert.equal(sentEmails.length, 1);

  redis.setNow(Date.UTC(2026, 0, 1, 12, 1, 1));
  const resent = await service.resendEmailCode({
    challengeId: start.challengeId,
    requestIp: "127.0.0.1",
  });

  assert.equal(resent.emailDeliverable, false);
  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[1].code, "999000");
  assert.equal(sentEmails[1].to, "nodeliver@example.com");
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
  const { service } = setupAuthService({
    generatedCode: "111222",
    configOverrides: { deploymentMode: "saas" },
  });
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

test("startEmailLogin with valid invite skips OTP and stores inviteTokenHash", async () => {
  const { service, sentEmails, redis } = setupAuthService({
    resolveInviteRegistration: async () => ({
      outcome: "valid",
      tokenHash: "a".repeat(64),
    }),
  });

  const result = await service.startEmailLogin({
    email: "guest@example.com",
    requestIp: "127.0.0.1",
    inviteToken: "raw-invite-token",
  });

  assert.equal(result.inviteRegistration, true);
  assert.equal(result.nextStep, "registration");
  assert.ok(result.authStateId);
  assert.equal(result.challengeId, "");
  assert.equal(sentEmails.length, 0);

  const raw = await redis.get(`auth:state:${result.authStateId}`);
  assert.ok(raw);
  const state = JSON.parse(raw) as { inviteTokenHash?: string; email: string };
  assert.equal(state.email, "guest@example.com");
  assert.equal(state.inviteTokenHash, "a".repeat(64));
});

test("startEmailLogin with unknown invite keeps emailed-code flow", async () => {
  const { service, sentEmails } = setupAuthService({
    resolveInviteRegistration: async () => ({ outcome: "not_found" }),
  });

  const result = await service.startEmailLogin({
    email: "guest@example.com",
    requestIp: "127.0.0.1",
    inviteToken: "garbage-token",
  });

  assert.equal(result.inviteRegistration, undefined);
  assert.equal(result.bootstrapRequired, undefined);
  assert.ok(result.challengeId);
  assert.equal(sentEmails.length, 1);
});

test("startEmailLogin rejects expired / used / revoked / wrong-email invites", async () => {
  for (const [outcome, code] of [
    ["expired", "INVITE_EXPIRED"],
    ["used", "INVITE_USED"],
    ["revoked", "INVITE_REVOKED"],
    ["email_mismatch", "INVITE_EMAIL_MISMATCH"],
  ] as const) {
    const { service, sentEmails } = setupAuthService({
      resolveInviteRegistration: async () => ({ outcome }),
    });
    await assert.rejects(
      () =>
        service.startEmailLogin({
          email: "guest@example.com",
          requestIp: "127.0.0.1",
          inviteToken: "invite-token",
        }),
      (error: unknown) => error instanceof AuthError && error.code === code,
    );
    assert.equal(sentEmails.length, 0);
  }
});

test("startEmailLogin with invite for existing user still requires emailed code", async () => {
  const { service, sentEmails } = setupAuthService({
    existingUser: true,
    resolveInviteRegistration: async () => ({
      outcome: "valid",
      tokenHash: "b".repeat(64),
    }),
  });

  const result = await service.startEmailLogin({
    email: "user@example.com",
    requestIp: "127.0.0.1",
    inviteToken: "invite-token",
  });

  assert.equal(result.inviteRegistration, undefined);
  assert.ok(result.challengeId);
  assert.equal(sentEmails.length, 1);
});

test("ordinary startEmailLogin without invite still requires emailed code", async () => {
  const { service, sentEmails } = setupAuthService({
    resolveInviteRegistration: async () => {
      throw new Error("resolver must not run without inviteToken");
    },
  });

  const result = await service.startEmailLogin({
    email: "newbie@example.com",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.inviteRegistration, undefined);
  assert.ok(result.challengeId);
  assert.equal(sentEmails.length, 1);
});

test("invite_only + valid invite link allows registration without pending email invite", async () => {
  const { service, sentEmails, redis } = setupAuthService({
    hasAnyUsers: true,
    // Simulate invite_only with no email-bound pending invite.
    resolveRegistrationAllowed: async () => false,
    resolveInviteRegistration: async () => ({
      outcome: "valid",
      tokenHash: "c".repeat(64),
    }),
  });

  const result = await service.startEmailLogin({
    email: "link-guest@example.com",
    requestIp: "127.0.0.1",
    inviteToken: "valid-link-token",
  });

  assert.equal(result.inviteRegistration, true);
  assert.equal(result.nextStep, "registration");
  assert.ok(result.authStateId);
  assert.equal(sentEmails.length, 0);
  const raw = await redis.get(`auth:state:${result.authStateId}`);
  assert.ok(raw);
  assert.equal((JSON.parse(raw) as { inviteTokenHash?: string }).inviteTokenHash, "c".repeat(64));
});

test("invite_only + no invite rejects with REGISTRATION_INVITE_ONLY", async () => {
  const { service, sentEmails } = setupAuthService({
    hasAnyUsers: true,
    resolveRegistrationAllowed: async () => false,
  });

  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "stranger@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof AuthError && error.code === "REGISTRATION_INVITE_ONLY",
  );
  assert.equal(sentEmails.length, 0);
});

test("invite_only + revoked or used invite link is rejected (not 403 invite_only)", async () => {
  for (const [outcome, code] of [
    ["revoked", "INVITE_REVOKED"],
    ["used", "INVITE_USED"],
  ] as const) {
    const { service, sentEmails } = setupAuthService({
      hasAnyUsers: true,
      resolveRegistrationAllowed: async () => false,
      resolveInviteRegistration: async () => ({ outcome }),
    });
    await assert.rejects(
      () =>
        service.startEmailLogin({
          email: "guest@example.com",
          requestIp: "127.0.0.1",
          inviteToken: "stale-link-token",
        }),
      (error: unknown) => error instanceof AuthError && error.code === code,
    );
    assert.equal(sentEmails.length, 0);
  }
});
