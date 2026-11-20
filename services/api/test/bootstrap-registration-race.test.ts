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

test("overlapping empty-catalog claims grant bootstrap to only one registrant", async () => {
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
    service.claimEmptyCatalogBootstrap("left@example.com"),
    service.claimEmptyCatalogBootstrap("right@example.com"),
  ]);
  const bootstrapped = [left, right].filter((result) => result === true);
  assert.equal(
    bootstrapped.length,
    1,
    "only one overlapping empty-catalog claim may win first registration",
  );
  const rejected = [left, right].filter((result) => result === false);
  assert.equal(rejected.length, 1);
});

test("startEmailLogin on empty self-host catalog requires setup (no OTP skip)", async () => {
  const redis = new InMemoryRedis();
  const service = new AuthService({
    redis,
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => false,
    },
    emailTemplates: {
      sendAuthEmailCode: async () => {},
    },
    config: createTestApiConfig(),
    resolveRegistrationAllowed: async () => false,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    generateCode: () => "222222",
    generateId: () => "id-1",
  });

  await assert.rejects(
    () => service.startEmailLogin({ email: "owner@example.com", requestIp: "203.0.113.8" }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SETUP_REQUIRED",
  );
});
