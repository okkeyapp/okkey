import test from "node:test";
import assert from "node:assert/strict";
import { EmailChangeError, EmailChangeService } from "../src/account/email-change.ts";
import { UniqueConstraintError } from "../src/storage/errors.ts";
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

function userRecord(id: string, email: string) {
  const now = new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString();
  return {
    id,
    email,
    publicKey: "pk",
    publicPqKey: null,
    locale: "ru" as string | null,
    createdAt: now,
    updatedAt: now,
  };
}

function setup() {
  const redis = new InMemoryRedis();
  redis.setNow(Date.UTC(2026, 0, 1, 12, 0, 0));
  const sentEmails: Array<{ to: string; code: string }> = [];
  const users = new Map([
    ["u1", userRecord("u1", "old@example.com")],
    ["u2", userRecord("u2", "taken@example.com")],
  ]);
  let nextId = 1;
  const service = new EmailChangeService({
    redis,
    users: {
      findById: async (id: string) => users.get(id) ?? null,
      findByEmail: async (email: string) =>
        Array.from(users.values()).find((user) => user.email === email) ?? null,
      updateEmail: async (id: string, email: string) => {
        if (Array.from(users.values()).some((user) => user.id !== id && user.email === email)) {
          throw new UniqueConstraintError("email already exists");
        }
        const user = users.get(id);
        if (!user) return null;
        const updated = { ...user, email };
        users.set(id, updated);
        return updated;
      },
    },
    emailTemplates: {
      sendAuthEmailCode: async (input) => {
        sentEmails.push({ to: input.to, code: input.variables.code });
      },
    },
    config: createTestApiConfig(),
    now: () => redis.now(),
    generateCode: () => "123456",
    generateId: () => `change-${nextId++}`,
  });
  return { service, sentEmails, users, redis };
}

test("email change start sends code to the new email", async () => {
  const { service, sentEmails } = setup();

  const result = await service.start({
    userId: "u1",
    email: " New@Example.com ",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.challengeId, "change-1");
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "new@example.com");
  assert.equal(sentEmails[0].code, "123456");
});

test("email change rejects existing email", async () => {
  const { service } = setup();

  await assert.rejects(
    () =>
      service.start({
        userId: "u1",
        email: "taken@example.com",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) => error instanceof EmailChangeError && error.code === "EMAIL_CHANGE_EMAIL_TAKEN",
  );
});

test("email change confirm updates user email", async () => {
  const { service, users } = setup();
  const start = await service.start({
    userId: "u1",
    email: "new@example.com",
    requestIp: "127.0.0.1",
  });

  const result = await service.confirm({
    userId: "u1",
    challengeId: start.challengeId,
    code: "123456",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.email, "new@example.com");
  assert.equal(users.get("u1")?.email, "new@example.com");
});

test("email change confirm reports attempts left for invalid code", async () => {
  const { service } = setup();
  const start = await service.start({
    userId: "u1",
    email: "new@example.com",
    requestIp: "127.0.0.1",
  });

  await assert.rejects(
    () =>
      service.confirm({
        userId: "u1",
        challengeId: start.challengeId,
        code: "000000",
        requestIp: "127.0.0.1",
      }),
    (error: unknown) =>
      error instanceof EmailChangeError &&
      error.code === "EMAIL_CHANGE_CODE_INVALID" &&
      error.details?.attemptsLeft === 4,
  );
});
