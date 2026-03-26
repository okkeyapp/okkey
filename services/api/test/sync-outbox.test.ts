import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InMemoryOutboxStore,
  SyncOutboxClient,
  computeBackoffDelayMs,
  type OutboxTransport,
} from "../../../packages/sync/dist/index.js";
import type { SyncAppendEventRequestDto, SyncEventWireDto, SyncEventsListResponseDto } from "../../../packages/types/dist/index.js";

function mkReq(baseVersion: number, eventType = "ITEM_UPDATE"): SyncAppendEventRequestDto {
  return {
    eventType,
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(`payload-${baseVersion}`, "utf8").toString("base64"),
      meta: {},
    },
    baseVersion,
    idempotencyKey: randomUUID(),
  };
}

function mkEvent(vaultId: string, version: number): SyncEventWireDto {
  return {
    id: randomUUID(),
    vaultId,
    actorId: null,
    eventType: "ITEM_UPDATE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(
        JSON.stringify({
          schemaVersion: 2,
          itemId: randomUUID(),
          vaultId,
          title: `v${version}`,
          categoryId: "login",
          createdAtMs: 1,
          updatedAtMs: version,
          sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
          fields: [],
        }),
        "utf8",
      ).toString("base64"),
      meta: {},
    },
    idempotencyKey: randomUUID(),
    clientCreatedAt: null,
    version,
    createdAt: new Date(version * 1000).toISOString(),
  };
}

test("computeBackoffDelayMs grows exponentially", () => {
  const r = () => 0.5;
  const d1 = computeBackoffDelayMs(1, 100, 10_000, 0, r);
  const d2 = computeBackoffDelayMs(2, 100, 10_000, 0, r);
  const d3 = computeBackoffDelayMs(3, 100, 10_000, 0, r);
  assert.equal(d1, 100);
  assert.equal(d2, 200);
  assert.equal(d3, 400);
});

test("outbox drains FIFO after offline failures", async () => {
  const vaultId = randomUUID();
  const store = new InMemoryOutboxStore();
  let online = false;
  const sent: number[] = [];
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      if (!online) throw new Error("NETWORK_DOWN");
      sent.push(body.baseVersion);
      return mkEvent(vaultId, body.baseVersion + 1);
    },
    async listVaultEvents(vId, afterVersion) {
      return { vaultId: vId, afterVersion, events: [] };
    },
  };

  const outbox = new SyncOutboxClient(store, transport, {
    nowMs: (() => {
      let now = 1_000;
      return () => (now += 1);
    })(),
    random: () => 0.5,
    baseDelayMs: 1_000_000,
    maxDelayMs: 1_000_000,
  });

  await outbox.enqueue({ vaultId, request: mkReq(1) });
  await outbox.enqueue({ vaultId, request: mkReq(2) });

  await outbox.drain(vaultId);
  const mid = await outbox.list();
  assert.equal(mid.length, 2);
  assert.ok(mid.every((e) => e.status === "failed" || e.status === "pending"));

  online = true;
  await outbox.retryAll();
  await outbox.drain(vaultId);
  const final = await outbox.list();
  assert.equal(final.length, 0);
  assert.deepEqual(sent, [1, 2]);
});

test("outbox resolves VERSION_MISMATCH via rebase and retry", async () => {
  const vaultId = randomUUID();
  const store = new InMemoryOutboxStore();
  let appendCalls = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      appendCalls += 1;
      if (appendCalls === 1) {
        throw {
          code: "VERSION_MISMATCH",
          message: "stale",
          details: {
            code: "VERSION_MISMATCH",
            expectedBaseVersion: body.baseVersion,
            latestVersion: 7,
          },
        };
      }
      assert.equal(body.baseVersion, 7);
      assert.equal(body.encryptedBlob.payload, Buffer.from("rebased", "utf8").toString("base64"));
      return mkEvent(vaultId, 8);
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      if (afterVersion >= 7) return { vaultId: vId, afterVersion, events: [] };
      return { vaultId: vId, afterVersion, events: [mkEvent(vId, 4)] };
    },
  };

  let conflictResolved = 0;
  const outbox = new SyncOutboxClient(store, transport, {
    replayOptions: {
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
    rebaseItemUpdate: async () => ({
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: Buffer.from("rebased", "utf8").toString("base64"),
        meta: {},
      },
    }),
    hooks: {
      onConflictResolved: () => {
        conflictResolved += 1;
      },
    },
  });

  await outbox.enqueue({ vaultId, request: mkReq(3) });
  await outbox.drain(vaultId);
  assert.equal(conflictResolved, 1);
  assert.equal((await outbox.list()).length, 0);
});

test("outbox survives restart via persisted store", async () => {
  const vaultId = randomUUID();
  const store = new InMemoryOutboxStore();
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      return mkEvent(vaultId, body.baseVersion + 1);
    },
    async listVaultEvents(vId, afterVersion) {
      return { vaultId: vId, afterVersion, events: [] };
    },
  };

  const first = new SyncOutboxClient(store, transport);
  await first.enqueue({ vaultId, request: mkReq(1, "ITEM_CREATE") });
  assert.equal((await first.list()).length, 1);

  const second = new SyncOutboxClient(store, transport);
  assert.equal((await second.list()).length, 1);
  await second.drain(vaultId);
  assert.equal((await second.list()).length, 0);
});

test("outbox marks entry dead after max attempts and emits stall hook", async () => {
  const vaultId = randomUUID();
  const store = new InMemoryOutboxStore();
  let stalled = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent() {
      throw new Error("NETWORK_DOWN");
    },
    async listVaultEvents(vId, afterVersion) {
      return { vaultId: vId, afterVersion, events: [] };
    },
  };
  const outbox = new SyncOutboxClient(store, transport, {
    maxAttempts: 2,
    nowMs: (() => {
      let n = 1_000;
      return () => (n += 1_000);
    })(),
    random: () => 0.5,
    baseDelayMs: 1,
    maxDelayMs: 1,
    hooks: { onQueueStalled: () => (stalled += 1) },
  });
  await outbox.enqueue({ vaultId, request: mkReq(1) });
  await outbox.drain(vaultId);
  await outbox.retryAll();
  await outbox.drain(vaultId);
  const left = await outbox.list();
  assert.equal(left.length, 1);
  assert.equal(left[0]?.status, "dead");
  assert.equal(stalled > 0, true);
});
