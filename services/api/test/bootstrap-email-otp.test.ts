import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "../src/auth/service.ts";
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
}

test("email OTP is skipped only while the self-hosted directory is empty", async () => {
  const redis = new InMemoryRedis();
  let userCount = 0;
  const sent: string[] = [];
  let nextId = 1;
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => userCount > 0,
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sent.push(input.to);
      },
    },
    config: createTestApiConfig(),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "111111",
    generateId: () => `id-${nextId++}`,
  });

  const first = await service.startEmailLogin({
    email: "first@example.com",
    requestIp: "203.0.113.8",
  });
  assert.equal(first.bootstrapRequired, true);
  assert.equal(sent.length, 0);

  userCount = 1;
  const second = await service.startEmailLogin({
    email: "second@example.com",
    requestIp: "203.0.113.8",
  });
  assert.equal(second.bootstrapRequired, undefined);
  assert.equal(second.nextStep, undefined);
  assert.ok(second.challengeId);
  assert.deepEqual(sent, ["second@example.com"]);
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
