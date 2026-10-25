import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import {
  InMemoryOutboxStore,
  ITEM_UPDATE_CONFLICT,
  SyncOutboxClient,
  computeBackoffDelayMs,
  type OutboxTransport,
} from "../../../packages/sync/dist/index.js";
import type { SyncAppendEventRequestDto, SyncEventWireDto, SyncEventsListResponseDto } from "../../../packages/types/dist/index.js";

function mkReq(
  baseVersion: number,
  eventType = "ITEM_UPDATE",
  referencedItemId?: string,
): SyncAppendEventRequestDto {
  return {
    eventType,
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(`payload-${baseVersion}`, "utf8").toString("base64"),
      meta: {},
    },
    baseVersion,
    idempotencyKey: testEntityId(),
    ...(referencedItemId ? { referencedItemId } : {}),
  };
}

function mkEvent(
  vaultId: string,
  version: number,
  options?: { referencedItemId?: string; eventType?: string },
): SyncEventWireDto {
  const itemId = options?.referencedItemId ?? testEntityId();
  return {
    id: testEntityId(),
    vaultId,
    actorId: null,
    eventType: options?.eventType ?? "ITEM_UPDATE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(
        JSON.stringify({
          schemaVersion: 2,
          itemId,
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
    idempotencyKey: testEntityId(),
    clientCreatedAt: null,
    referencedItemId: options?.referencedItemId ?? itemId,
    version,
    createdAt: new Date(version * 1000).toISOString(),
  };
}

function mkList(
  vaultId: string,
  afterVersion: number,
  events: SyncEventWireDto[],
  hasMore = false,
): SyncEventsListResponseDto {
  return {
    vaultId,
    afterVersion,
    events,
    latestVersion: events.length > 0 ? (events[events.length - 1]?.version ?? afterVersion) : afterVersion,
    hasMore,
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
  const vaultId = testEntityId();
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
      return mkList(vId, afterVersion, []);
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
  const vaultId = testEntityId();
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
      if (afterVersion >= 7) return mkList(vId, afterVersion, []);
      return mkList(vId, afterVersion, [mkEvent(vId, 4)]);
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

test("outbox does not overwrite same-item concurrent ITEM_UPDATE after VERSION_MISMATCH", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const store = new InMemoryOutboxStore();
  let appendCalls = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      appendCalls += 1;
      if (appendCalls === 1) {
        throw {
          name: "ApiRequestError",
          status: 409,
          message: "VERSION_MISMATCH: baseVersion is stale",
          body: {
            error: "VERSION_MISMATCH",
            message: "baseVersion is stale",
            requestId: "req-conflict",
            details: {
              expectedBaseVersion: body.baseVersion,
              latestVersion: 4,
            },
          },
        };
      }
      throw new Error("must not retry overwrite after same-item conflict");
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      if (afterVersion >= 4) return mkList(vId, afterVersion, []);
      return mkList(vId, afterVersion, [
        mkEvent(vId, afterVersion + 1, { referencedItemId: itemId, eventType: "ITEM_UPDATE" }),
      ]);
    },
  };

  const outbox = new SyncOutboxClient(store, transport, {
    replayOptions: {
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  });

  await outbox.enqueue({ vaultId, request: mkReq(2, "ITEM_UPDATE", itemId) });
  await outbox.drain(vaultId);
  const left = await outbox.list();
  assert.equal(appendCalls, 1);
  assert.equal(left.length, 1);
  assert.equal(left[0]?.status, "dead");
  assert.equal(left[0]?.lastErrorCode, ITEM_UPDATE_CONFLICT);
});

test("outbox rebases ITEM_UPDATE when remote events touch a different item", async () => {
  const vaultId = testEntityId();
  const localItemId = testEntityId();
  const peerItemId = testEntityId();
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
            latestVersion: 6,
          },
        };
      }
      assert.equal(body.baseVersion, 6);
      assert.equal(body.referencedItemId, localItemId);
      return mkEvent(vaultId, 7, { referencedItemId: localItemId });
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      if (afterVersion >= 6) return mkList(vId, afterVersion, []);
      return mkList(vId, afterVersion, [
        mkEvent(vId, afterVersion + 1, { referencedItemId: peerItemId }),
      ]);
    },
  };

  const outbox = new SyncOutboxClient(store, transport);
  await outbox.enqueue({ vaultId, request: mkReq(3, "ITEM_UPDATE", localItemId) });
  await outbox.drain(vaultId);
  assert.equal(appendCalls, 2);
  assert.equal((await outbox.list()).length, 0);
});

test("outbox resolves ApiRequestError-shaped 409 VERSION_MISMATCH without details.code", async () => {
  const vaultId = testEntityId();
  const store = new InMemoryOutboxStore();
  let appendCalls = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      appendCalls += 1;
      if (appendCalls === 1) {
        // Matches Core API + ApiRequestError: top-level body.error, no details.code.
        throw {
          name: "ApiRequestError",
          status: 409,
          message: "VERSION_MISMATCH: baseVersion is stale",
          body: {
            error: "VERSION_MISMATCH",
            message: "baseVersion is stale",
            requestId: "req-test",
            details: {
              expectedBaseVersion: body.baseVersion,
              latestVersion: 7,
            },
          },
        };
      }
      assert.equal(body.baseVersion, 7);
      assert.equal(body.eventType, "ITEM_CREATE");
      return mkEvent(vaultId, 8);
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      if (afterVersion >= 7) return { vaultId: vId, afterVersion, events: [] };
      return { vaultId: vId, afterVersion, events: [mkEvent(vId, afterVersion + 1)] };
    },
  };

  let conflictResolved = 0;
  const outbox = new SyncOutboxClient(store, transport, {
    replayOptions: {
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
    hooks: {
      onConflictResolved: () => {
        conflictResolved += 1;
      },
    },
  });

  await outbox.enqueue({ vaultId, request: mkReq(3, "ITEM_CREATE") });
  await outbox.drain(vaultId);
  assert.equal(conflictResolved, 1);
  assert.equal(appendCalls, 2);
  assert.equal((await outbox.list()).length, 0);
});

test("outbox resolves VERSION_MISMATCH for VAULT_KEY_ROTATION without item rebase", async () => {
  const vaultId = testEntityId();
  const store = new InMemoryOutboxStore();
  const originalPayload = Buffer.from("rotation-payload", "utf8").toString("base64");
  let appendCalls = 0;
  let rebaseCalled = 0;
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
            latestVersion: 9,
          },
        };
      }
      assert.equal(body.eventType, "VAULT_KEY_ROTATION");
      assert.equal(body.baseVersion, 9);
      assert.equal(body.encryptedBlob.payload, originalPayload);
      return mkEvent(vaultId, 10);
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      if (afterVersion >= 9) return mkList(vId, afterVersion, []);
      return mkList(vId, afterVersion, [mkEvent(vId, 5)]);
    },
  };

  const outbox = new SyncOutboxClient(store, transport, {
    replayOptions: {
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
    rebaseItemUpdate: async () => {
      rebaseCalled += 1;
      return {
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("unexpected-rebase", "utf8").toString("base64"),
          meta: {},
        },
      };
    },
  });

  await outbox.enqueue({
    vaultId,
    request: {
      eventType: "VAULT_KEY_ROTATION",
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: originalPayload,
        meta: {},
      },
      baseVersion: 4,
      idempotencyKey: testEntityId(),
    },
  });
  await outbox.drain(vaultId);

  assert.equal(rebaseCalled, 0);
  assert.equal((await outbox.list()).length, 0);
});

test("outbox survives restart via persisted store", async () => {
  const vaultId = testEntityId();
  const store = new InMemoryOutboxStore();
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      return mkEvent(vaultId, body.baseVersion + 1);
    },
    async listVaultEvents(vId, afterVersion) {
      return mkList(vId, afterVersion, []);
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
  const vaultId = testEntityId();
  const store = new InMemoryOutboxStore();
  let stalled = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent() {
      throw new Error("NETWORK_DOWN");
    },
    async listVaultEvents(vId, afterVersion) {
      return mkList(vId, afterVersion, []);
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
