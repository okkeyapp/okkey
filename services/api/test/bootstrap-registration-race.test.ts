import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "../src/auth/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
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

test("email OTP is skipped only while the directory is empty", async () => {
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

test("two overlapping first-run registrations cannot both skip OTP", async () => {
  const redis = new InMemoryRedis();
  let entered = 0;
  let releaseSecond: () => void = () => {};
  const secondEntered = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let releaseFirst: () => void = () => {};
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => {
        entered += 1;
        if (entered === 1) {
          await secondEntered;
          releaseFirst();
          return false;
        }
        releaseSecond();
        await firstMayFinish;
        return false;
      },
    },
    emailTemplates: {
      sendAuthEmailCode: async () => {},
    },
    config: createTestApiConfig(),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "222222",
    generateId: () => `id-${entered}`,
  });

  const [left, right] = await Promise.all([
    service.startEmailLogin({ email: "left@example.com", requestIp: "203.0.113.8" }),
    service.startEmailLogin({ email: "right@example.com", requestIp: "203.0.113.8" }),
  ]);
  const skipped = [left, right].filter((result) => result.bootstrapRequired === true);
  assert.equal(
    skipped.length,
    1,
    "only one overlapping first-run registration may skip OTP",
  );
});
