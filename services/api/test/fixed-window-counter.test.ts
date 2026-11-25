import assert from "node:assert/strict";
import test from "node:test";

import {
  incrementFixedWindow,
  type FixedWindowCounterRedis,
} from "../src/storage/fixed-window-counter.ts";
import { StorageQueryError } from "../src/storage/errors.ts";

class MemoryFixedWindowRedis implements FixedWindowCounterRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  nowMs = Date.now();
  failOn: "setIfNotExistsWithTtl" | "incr" | "ttl" | "expire" | null = null;

  private maybeFail(op: NonNullable<MemoryFixedWindowRedis["failOn"]>): void {
    if (this.failOn === op) {
      throw new StorageQueryError(`redis ${op} failed`, new Error("boom"));
    }
  }

  private purgeIfExpired(key: string): void {
    const expiresAt = this.expirations.get(key);
    if (expiresAt !== undefined && this.nowMs >= expiresAt) {
      this.values.delete(key);
      this.expirations.delete(key);
    }
  }

  async setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    this.maybeFail("setIfNotExistsWithTtl");
    this.purgeIfExpired(key);
    if (this.values.has(key)) {
      return false;
    }
    this.values.set(key, value);
    this.expirations.set(key, this.nowMs + ttlSeconds * 1000);
    return true;
  }

  async incr(key: string): Promise<number> {
    this.maybeFail("incr");
    this.purgeIfExpired(key);
    const next = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(next));
    return next;
  }

  async ttl(key: string): Promise<number> {
    this.maybeFail("ttl");
    this.purgeIfExpired(key);
    if (!this.values.has(key)) {
      return -2;
    }
    const expiresAt = this.expirations.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.max(0, Math.ceil((expiresAt - this.nowMs) / 1000));
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    this.maybeFail("expire");
    this.purgeIfExpired(key);
    if (!this.values.has(key)) {
      return false;
    }
    this.expirations.set(key, this.nowMs + seconds * 1000);
    return true;
  }

  /** Simulate a legacy key that was incremented without a TTL. */
  seedOrphanCounter(key: string, count: number): void {
    this.values.set(key, String(count));
    this.expirations.delete(key);
  }
}

test("incrementFixedWindow counts within a window and opens TTL on first hit", async () => {
  const redis = new MemoryFixedWindowRedis();
  const key = "rate:test";

  assert.equal(await incrementFixedWindow(redis, key, 60), 1);
  assert.equal(await redis.ttl(key), 60);
  assert.equal(await incrementFixedWindow(redis, key, 60), 2);
  assert.equal(await incrementFixedWindow(redis, key, 60), 3);
  assert.equal(redis.values.get(key), "3");
});

test("incrementFixedWindow resets after the window expires", async () => {
  const redis = new MemoryFixedWindowRedis();
  const key = "rate:reset";

  assert.equal(await incrementFixedWindow(redis, key, 10), 1);
  assert.equal(await incrementFixedWindow(redis, key, 10), 2);

  redis.nowMs += 11_000;

  assert.equal(await incrementFixedWindow(redis, key, 10), 1);
  assert.equal(await redis.ttl(key), 10);
});

test("incrementFixedWindow self-heals a key that has no TTL", async () => {
  const redis = new MemoryFixedWindowRedis();
  const key = "rate:orphan";
  redis.seedOrphanCounter(key, 5);
  assert.equal(await redis.ttl(key), -1);

  assert.equal(await incrementFixedWindow(redis, key, 30), 6);
  assert.equal(await redis.ttl(key), 30);
  assert.equal(await incrementFixedWindow(redis, key, 30), 7);
});

test("incrementFixedWindow propagates Redis errors from incr", async () => {
  const redis = new MemoryFixedWindowRedis();
  redis.failOn = "incr";

  await assert.rejects(
    () => incrementFixedWindow(redis, "rate:err", 60),
    (error: unknown) => error instanceof StorageQueryError && error.message.includes("incr"),
  );
});

test("incrementFixedWindow propagates Redis errors from setIfNotExistsWithTtl", async () => {
  const redis = new MemoryFixedWindowRedis();
  redis.failOn = "setIfNotExistsWithTtl";

  await assert.rejects(
    () => incrementFixedWindow(redis, "rate:err-set", 60),
    (error: unknown) =>
      error instanceof StorageQueryError && error.message.includes("setIfNotExistsWithTtl"),
  );
});

test("incrementFixedWindow propagates Redis errors from self-heal expire", async () => {
  const redis = new MemoryFixedWindowRedis();
  redis.seedOrphanCounter("rate:err-expire", 1);
  redis.failOn = "expire";

  await assert.rejects(
    () => incrementFixedWindow(redis, "rate:err-expire", 60),
    (error: unknown) => error instanceof StorageQueryError && error.message.includes("expire"),
  );
});
