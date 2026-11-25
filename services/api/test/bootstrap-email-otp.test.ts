import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, AuthService } from "../src/auth/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExistsWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    await this.setWithTtl(key, value, ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(next));
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }

  async ttl(key: string): Promise<number> {
    return this.values.has(key) ? 60 : -2;
  }
}

test("empty self-host catalog requires setup wizard instead of OTP skip", async () => {
  const redis = new InMemoryRedis();
  const sent: string[] = [];
  let nextId = 1;
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => false,
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sent.push(input.to);
      },
    },
    config: createTestApiConfig(),
    resolveEmailDeliverable: async () => true,
    resolveRegistrationAllowed: async () => false,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "111111",
    generateId: () => `id-${nextId++}`,
  });

  await assert.rejects(
    () =>
      service.startEmailLogin({
        email: "first@example.com",
        requestIp: "203.0.113.8",
      }),
    (error: unknown) => error instanceof AuthError && error.code === "SETUP_REQUIRED",
  );
  assert.equal(sent.length, 0);
});

test("after the first user exists, email OTP is required for later registrants", async () => {
  const redis = new InMemoryRedis();
  const sent: string[] = [];
  let nextId = 1;
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => true,
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sent.push(input.to);
      },
    },
    config: createTestApiConfig(),
    resolveEmailDeliverable: async () => true,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "111111",
    generateId: () => `id-${nextId++}`,
  });

  const second = await service.startEmailLogin({
    email: "second@example.com",
    requestIp: "203.0.113.8",
  });
  assert.equal(second.bootstrapRequired, undefined);
  assert.equal(second.nextStep, undefined);
  assert.equal(second.emailDeliverable, true);
  assert.ok(second.challengeId);
  assert.deepEqual(sent, ["second@example.com"]);

  const undeliverableSent: Array<{ to: string; code: string }> = [];
  const undeliverable = new AuthService({
    redis: new InMemoryRedis(),
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => true,
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        undeliverableSent.push({ to: input.to, code: input.variables.code });
      },
    },
    config: createTestApiConfig(),
    resolveEmailDeliverable: async () => false,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "111111",
    generateId: () => "id-undeliverable",
  });
  const skipped = await undeliverable.startEmailLogin({
    email: "second@example.com",
    requestIp: "203.0.113.9",
  });
  assert.equal(skipped.bootstrapRequired, undefined);
  assert.equal(skipped.emailDeliverable, false);
  assert.ok(skipped.challengeId);
  // Inactive mail hands the code to the worker log path. emailDeliverable stays false, so SMTP is not used.
  assert.deepEqual(undeliverableSent, [{ to: "second@example.com", code: "111111" }]);
});

test("saas empty catalog always sends email OTP", async () => {
  const redis = new InMemoryRedis();
  const sent: string[] = [];
  let nextId = 1;
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => false,
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sent.push(input.to);
      },
    },
    config: createTestApiConfig({ deploymentMode: "saas" }),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "111111",
    generateId: () => `id-${nextId++}`,
  });

  const result = await service.startEmailLogin({
    email: "first@example.com",
    requestIp: "203.0.113.8",
  });
  assert.equal(result.bootstrapRequired, undefined);
  assert.ok(result.challengeId);
  assert.deepEqual(sent, ["first@example.com"]);
});
