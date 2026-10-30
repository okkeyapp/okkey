import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryDeviceBindChallengeStore,
  RedisDeviceBindChallengeStore,
} from "../src/device/bind-challenge-store.ts";

test("MemoryDeviceBindChallengeStore take is one-shot and drops expired rows", async () => {
  const clock = { now: 1_000 };
  const store = new MemoryDeviceBindChallengeStore(() => clock.now);
  await store.put("k1", "v1", 2);
  assert.equal(await store.take("k1"), "v1");
  assert.equal(await store.take("k1"), null);

  await store.put("k2", "v2", 1);
  clock.now += 1_001;
  assert.equal(await store.take("k2"), null);
});

test("RedisDeviceBindChallengeStore uses TTL put and atomic take", async () => {
  const rows = new Map<string, { value: string; ttl: number }>();
  const redis = {
    async setWithTtl(key: string, value: string, ttlSeconds: number) {
      rows.set(key, { value, ttl: ttlSeconds });
    },
    async getDel(key: string) {
      const row = rows.get(key);
      rows.delete(key);
      return row?.value ?? null;
    },
  };
  const store = new RedisDeviceBindChallengeStore(redis);
  await store.put("device-bind:a", '{"ok":true}', 120);
  assert.deepEqual(rows.get("device-bind:a"), { value: '{"ok":true}', ttl: 120 });
  assert.equal(await store.take("device-bind:a"), '{"ok":true}');
  assert.equal(await store.take("device-bind:a"), null);
});
