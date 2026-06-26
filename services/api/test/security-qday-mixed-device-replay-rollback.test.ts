import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import {
  EventGapError,
  InMemoryOutboxStore,
  SyncOutboxClient,
  SyncReplayEngine,
  type OutboxTransport,
} from "../../../packages/sync/dist/index.js";
import type {
  SyncAppendEventRequestDto,
  SyncEventWireDto,
  SyncEventsListResponseDto,
} from "../../../packages/types/dist/index.js";

function mkReq(baseVersion: number, payload = `payload-${baseVersion}`): SyncAppendEventRequestDto {
  return {
    eventType: "ITEM_UPDATE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(payload, "utf8").toString("base64"),
      meta: {},
    },
    baseVersion,
    idempotencyKey: testEntityId(),
  };
}

function mkEvent(vaultId: string, version: number, eventType = "ITEM_UPDATE"): SyncEventWireDto {
  return {
    id: testEntityId(),
    vaultId,
    actorId: null,
    eventType,
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(`cipher-v${version}`, "utf8").toString("base64"),
      meta: {},
    },
    idempotencyKey: testEntityId(),
    clientCreatedAt: null,
    version,
    createdAt: new Date(version * 1000).toISOString(),
  };
}

test("security: mixed-device stale session resolves VERSION_MISMATCH after remote rotation", async () => {
  const vaultId = testEntityId();
  const deviceAStore = new InMemoryOutboxStore();
  const remoteEvents: SyncEventWireDto[] = [
    mkEvent(vaultId, 1, "VAULT_SHARE"),
    mkEvent(vaultId, 2, "VAULT_KEY_ROTATION"),
    mkEvent(vaultId, 3, "ITEM_UPDATE"),
  ];

  let appendCalls = 0;
  const transport: OutboxTransport = {
    async appendVaultEvent(_vaultId, body) {
      appendCalls += 1;
      if (appendCalls === 1) {
        throw {
          code: "VERSION_MISMATCH",
          message: "stale device session",
          details: {
            code: "VERSION_MISMATCH",
            expectedBaseVersion: body.baseVersion,
            latestVersion: 3,
          },
        };
      }
      assert.equal(body.baseVersion, 3);
      return mkEvent(vaultId, 4, body.eventType);
    },
    async listVaultEvents(vId, afterVersion): Promise<SyncEventsListResponseDto> {
      return {
        vaultId: vId,
        afterVersion,
        events: remoteEvents.filter((event) => event.version > afterVersion),
      };
    },
  };

  let resolved = 0;
  const deviceAOutbox = new SyncOutboxClient(deviceAStore, transport, {
    replayOptions: {
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
    rebaseItemUpdate: async () => ({
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: Buffer.from("rebased-after-remote-rotation", "utf8").toString("base64"),
        meta: {},
      },
    }),
    hooks: {
      onConflictResolved: () => {
        resolved += 1;
      },
    },
  });

  await deviceAOutbox.enqueue({
    vaultId,
    request: mkReq(1, "device-a-stale"),
  });
  await deviceAOutbox.drain(vaultId);

  assert.equal(resolved, 1);
  assert.equal((await deviceAOutbox.list()).length, 0);
});

test("security: replay rollback edge with missing version fails fast with EventGapError", async () => {
  const vaultId = testEntityId();
  const engine = new SyncReplayEngine({ vaultId });

  await assert.rejects(
    () =>
      engine.applyEvents([
        mkEvent(vaultId, 1, "VAULT_CREATE"),
        // version 2 is missing, emulating rolled-back / truncated history segment
        mkEvent(vaultId, 3, "VAULT_KEY_ROTATION"),
      ]),
    (error: unknown) =>
      error instanceof EventGapError &&
      error.details.expectedVersion === 2 &&
      error.details.actualVersion === 3,
  );
});

test("security: replay quarantines stale non-duplicate event during rollback-like stream", async () => {
  const vaultId = testEntityId();
  const engine = new SyncReplayEngine({ vaultId });

  await engine.applyEvents([mkEvent(vaultId, 1, "VAULT_CREATE"), mkEvent(vaultId, 2, "VAULT_SHARE")]);
  await engine.applyEvents([
    mkEvent(vaultId, 3, "VAULT_KEY_ROTATION"),
    // stale event with new id should not be applied
    mkEvent(vaultId, 2, "DEVICE_ADD"),
  ]);

  const snapshot = engine.getStateSnapshot();
  assert.equal(snapshot.lastAppliedVersion, 3);
  assert.equal(snapshot.quarantined.length, 1);
  assert.equal(snapshot.quarantined[0]?.reason, "STALE_VERSION_NOT_DUPLICATE");
});
