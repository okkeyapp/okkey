import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  EventGapError,
  SignatureValidationError,
  SyncReplayEngine,
  replayVaultEvents,
} from "../../../packages/sync/dist/index.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
} from "../../../packages/types/dist/index.js";
import type { SyncEventWireDto } from "../../../packages/types/dist/index.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(thisDir, "fixtures", "sync-replay");

function opaqueJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function baseWire(
  partial: Partial<SyncEventWireDto> &
    Pick<SyncEventWireDto, "eventType" | "version"> & {
      encryptedPayload?: string;
      payloadSchemaVersion?: number;
    },
): SyncEventWireDto {
  return {
    id: partial.id ?? testEntityId(),
    vaultId: partial.vaultId ?? "1156820912149101",
    actorId: partial.actorId ?? null,
    eventType: partial.eventType,
    encryptedBlob: partial.encryptedBlob ?? {
      crypto_version: partial.payloadSchemaVersion ?? ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      algorithm: "opaque",
      payload: partial.encryptedPayload ?? opaqueJson({}),
      meta: {},
    },
    // Legacy test shape still consumed by getEventBlob fallbacks.
    ...(partial.encryptedPayload
      ? {
          encryptedPayload: partial.encryptedPayload,
          payloadSchemaVersion:
            partial.payloadSchemaVersion ?? ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
        }
      : {}),
    idempotencyKey: partial.idempotencyKey ?? null,
    clientCreatedAt: partial.clientCreatedAt ?? null,
    referencedItemId: partial.referencedItemId,
    itemSoftDeleted: partial.itemSoftDeleted,
    version: partial.version,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  } as SyncEventWireDto;
}

interface FixtureStreamEvent {
  id: string;
  vaultId: string;
  actorId: string | null;
  eventType: string;
  payloadSchemaVersion: number;
  version: number;
  createdAt: string;
  payloadJson: unknown;
}

async function readJsonFixture<T>(filename: string): Promise<T> {
  const raw = await readFile(resolve(fixturesDir, filename), "utf8");
  return JSON.parse(raw) as T;
}

function materializeFixtureEvents(events: FixtureStreamEvent[]): SyncEventWireDto[] {
  return events.map((ev) =>
    baseWire({
      id: ev.id,
      vaultId: ev.vaultId,
      actorId: ev.actorId,
      eventType: ev.eventType,
      payloadSchemaVersion: ev.payloadSchemaVersion,
      version: ev.version,
      createdAt: ev.createdAt,
      encryptedPayload: opaqueJson(ev.payloadJson),
    }),
  );
}

test("replayVaultEvents sorts events by version deterministically", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const created = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "A",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const updated = { ...created, title: "B", updatedAtMs: 2 };

  const state = await replayVaultEvents(
    [
      baseWire({
        vaultId,
        eventType: "ITEM_UPDATE",
        version: 2,
        encryptedPayload: opaqueJson(updated),
      }),
      baseWire({
        vaultId,
        eventType: "ITEM_CREATE",
        version: 1,
        encryptedPayload: opaqueJson(created),
      }),
    ],
    {
      vaultId,
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  );

  assert.equal(state.items.get(itemId)?.title, "B");
  assert.equal(state.lastAppliedVersion, 2);
});

test("SyncReplayEngine rejects version gap", async () => {
  const vaultId = testEntityId();
  const engine = new SyncReplayEngine({
    vaultId,
    decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  });

  const events = [
    baseWire({
      vaultId,
      eventType: "ITEM_CREATE",
      version: 2,
      encryptedPayload: opaqueJson({
        schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
        itemId: testEntityId(),
        vaultId,
        title: "A",
        categoryId: "login",
        createdAtMs: 1,
        updatedAtMs: 1,
        sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
        fields: [],
      }),
    }),
  ];

  await assert.rejects(() => engine.applyEvents(events), (err: unknown) => {
    assert.ok(err instanceof EventGapError);
    return true;
  });
});

test("SyncReplayEngine deduplicates repeated event id", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const eventId = testEntityId();
  const row = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "A",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };

  const engine = new SyncReplayEngine({
    vaultId,
    decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  });
  await engine.applyEvents([
    baseWire({
      id: eventId,
      vaultId,
      eventType: "ITEM_CREATE",
      version: 1,
      encryptedPayload: opaqueJson(row),
    }),
  ]);
  await engine.applyEvents([
    baseWire({
      id: eventId,
      vaultId,
      eventType: "ITEM_CREATE",
      version: 1,
      encryptedPayload: opaqueJson(row),
    }),
  ]);

  const state = engine.getStateSnapshot();
  assert.equal(state.items.size, 1);
  assert.equal(state.lastAppliedVersion, 1);
});

test("SyncReplayEngine quarantines legacy folder events on vault stream", async () => {
  const vaultId = testEntityId();
  const engine = new SyncReplayEngine({
    vaultId,
    unknownEventPolicy: "quarantine",
  });

  await engine.applyEvents([
    baseWire({
      vaultId,
      actorId: testEntityId(),
      eventType: "FOLDER_CREATE",
      version: 1,
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      encryptedPayload: opaqueJson({}),
    }),
  ]);

  const state = engine.getStateSnapshot();
  assert.equal(state.quarantined.length, 1);
  assert.equal(state.quarantined[0]?.reason, "UNKNOWN_EVENT_TYPE");
});

test("SyncReplayEngine supports unknown event quarantine policy and fetch loop", async () => {
  const vaultId = testEntityId();
  const pages: Array<{ events: SyncEventWireDto[]; hasMore: boolean }> = [
    {
      events: [
        baseWire({ vaultId, eventType: "UNKNOWN_FUTURE_EVENT", version: 1 }),
        baseWire({ vaultId, eventType: "VAULT_SHARE", version: 2 }),
      ],
      hasMore: true,
    },
    {
      events: [baseWire({ vaultId, eventType: "DEVICE_ADD", version: 3 })],
      hasMore: false,
    },
  ];
  let idx = 0;

  const engine = new SyncReplayEngine({
    vaultId,
    unknownEventPolicy: "quarantine",
  });
  const state = await engine.replayFromFetcher(async (incomingVaultId, afterVersion) => {
    assert.equal(incomingVaultId, vaultId);
    assert.ok(afterVersion >= 0);
    const page = pages[idx++] ?? { events: [], hasMore: false };
    const last = page.events[page.events.length - 1]?.version ?? afterVersion;
    return {
      vaultId,
      afterVersion,
      events: page.events,
      latestVersion: last,
      hasMore: page.hasMore,
    };
  });

  assert.equal(state.vaultLifecycle.latestShareVersion, 2);
  assert.equal(state.deviceLifecycle.latestAddVersion, 3);
  assert.equal(state.quarantined.length, 1);
  assert.equal(state.quarantined[0]?.reason, "UNKNOWN_EVENT_TYPE");
  assert.equal(state.lastAppliedVersion, 3);
  assert.equal(idx, 2);
});

test("SyncReplayEngine updates VAULT_* and DEVICE_* lifecycle handlers", async () => {
  const vaultId = testEntityId();
  const state = await replayVaultEvents(
    [
      baseWire({ vaultId, eventType: "VAULT_CREATE", version: 1 }),
      baseWire({ vaultId, eventType: "VAULT_SHARE", version: 2 }),
      baseWire({ vaultId, eventType: "VAULT_KEY_ROTATION", version: 3 }),
      baseWire({ vaultId, eventType: "DEVICE_ADD", version: 4 }),
      baseWire({ vaultId, eventType: "DEVICE_REMOVE", version: 5 }),
    ],
    { vaultId },
  );
  assert.equal(state.vaultLifecycle.latestCreateVersion, 1);
  assert.equal(state.vaultLifecycle.latestShareVersion, 2);
  assert.equal(state.vaultLifecycle.latestKeyRotationVersion, 3);
  assert.equal(state.deviceLifecycle.latestAddVersion, 4);
  assert.equal(state.deviceLifecycle.latestRemoveVersion, 5);
});

test("SyncReplayEngine converges deterministically for VAULT_SHARE + VAULT_KEY_ROTATION stream", async () => {
  const vaultId = testEntityId();
  const duplicateRotationId = testEntityId();

  const ordered = [
    baseWire({ vaultId, eventType: "VAULT_CREATE", version: 1 }),
    baseWire({ vaultId, eventType: "VAULT_SHARE", version: 2 }),
    baseWire({ id: duplicateRotationId, vaultId, eventType: "VAULT_KEY_ROTATION", version: 3 }),
  ];
  const shuffled = [
    baseWire({ id: duplicateRotationId, vaultId, eventType: "VAULT_KEY_ROTATION", version: 3 }),
    baseWire({ vaultId, eventType: "VAULT_SHARE", version: 2 }),
    baseWire({ vaultId, eventType: "VAULT_CREATE", version: 1 }),
    // duplicate delivery of the same rotation event id/version
    baseWire({ id: duplicateRotationId, vaultId, eventType: "VAULT_KEY_ROTATION", version: 3 }),
  ];

  const stateOrdered = await replayVaultEvents(ordered, { vaultId });
  const stateShuffled = await replayVaultEvents(shuffled, { vaultId });

  assert.equal(stateOrdered.lastAppliedVersion, 3);
  assert.equal(stateShuffled.lastAppliedVersion, 3);
  assert.equal(stateOrdered.vaultLifecycle.latestCreateVersion, 1);
  assert.equal(stateOrdered.vaultLifecycle.latestShareVersion, 2);
  assert.equal(stateOrdered.vaultLifecycle.latestKeyRotationVersion, 3);
  assert.deepEqual(stateShuffled.vaultLifecycle, stateOrdered.vaultLifecycle);
});

test("SyncReplayEngine quarantines ITEM_UPDATE for unknown item id", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const row = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "orphan-update",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const state = await replayVaultEvents(
    [
      baseWire({
        vaultId,
        eventType: "ITEM_UPDATE",
        version: 1,
        referencedItemId: itemId,
        itemSoftDeleted: false,
        encryptedPayload: opaqueJson(row),
      }),
    ],
    {
      vaultId,
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  );
  assert.equal(state.items.size, 0);
  assert.equal(state.quarantined.length, 1);
  assert.equal(state.quarantined[0]?.reason, "ITEM_UNKNOWN");
});

test("SyncReplayEngine quarantines unmarked soft-delete on ITEM_UPDATE", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const created = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "live",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const deletedPlaintext = {
    ...created,
    deleted: true,
    deletedAtMs: 2,
    updatedAtMs: 2,
    title: "",
    sections: [],
    fields: [],
  };
  const state = await replayVaultEvents(
    [
      baseWire({
        vaultId,
        eventType: "ITEM_CREATE",
        version: 1,
        referencedItemId: itemId,
        encryptedPayload: opaqueJson(created),
      }),
      baseWire({
        vaultId,
        eventType: "ITEM_UPDATE",
        version: 2,
        referencedItemId: itemId,
        itemSoftDeleted: false,
        encryptedPayload: opaqueJson(deletedPlaintext),
      }),
    ],
    {
      vaultId,
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  );
  assert.equal(state.items.get(itemId)?.deleted, false);
  assert.equal(state.items.get(itemId)?.title, "live");
  assert.equal(state.quarantined.length, 1);
  assert.equal(state.quarantined[0]?.reason, "ITEM_SOFT_DELETE_UNMARKED");
});

test("SyncReplayEngine quarantines omitted soft-delete flag on ITEM_UPDATE (put-only attack)", async () => {
  // PoC: existing item + ITEM_UPDATE with plaintext deleted:true and no itemSoftDeleted.
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const created = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "colleague-login",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const deletedPlaintext = {
    ...created,
    deleted: true,
    deletedAtMs: 2,
    updatedAtMs: 2,
  };
  const state = await replayVaultEvents(
    [
      baseWire({
        vaultId,
        eventType: "ITEM_CREATE",
        version: 1,
        referencedItemId: itemId,
        itemSoftDeleted: false,
        encryptedPayload: opaqueJson(created),
      }),
      baseWire({
        vaultId,
        eventType: "ITEM_UPDATE",
        version: 2,
        referencedItemId: itemId,
        // Omit itemSoftDeleted entirely (attacker / pre-flag client shape).
        encryptedPayload: opaqueJson(deletedPlaintext),
      }),
    ],
    {
      vaultId,
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  );
  assert.equal(state.items.get(itemId)?.deleted, false);
  assert.equal(state.items.get(itemId)?.title, "colleague-login");
  assert.equal(state.quarantined.length, 1);
  assert.equal(state.quarantined[0]?.reason, "ITEM_SOFT_DELETE_UNMARKED");
});

test("SyncReplayEngine applies soft-delete when server marks ITEM_UPDATE", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const created = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "live",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const deletedPlaintext = {
    ...created,
    deleted: true,
    deletedAtMs: 2,
    updatedAtMs: 2,
  };
  const state = await replayVaultEvents(
    [
      baseWire({
        vaultId,
        eventType: "ITEM_CREATE",
        version: 1,
        referencedItemId: itemId,
        encryptedPayload: opaqueJson(created),
      }),
      baseWire({
        vaultId,
        eventType: "ITEM_UPDATE",
        version: 2,
        referencedItemId: itemId,
        itemSoftDeleted: true,
        encryptedPayload: opaqueJson(deletedPlaintext),
      }),
    ],
    {
      vaultId,
      decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    },
  );
  assert.equal(state.items.get(itemId)?.deleted, true);
  assert.equal(state.quarantined.length, 0);
});

test("SyncReplayEngine supports unknown event ignore policy", async () => {
  const vaultId = testEntityId();
  const state = await replayVaultEvents(
    [baseWire({ vaultId, eventType: "UNKNOWN_EVENT", version: 1 })],
    { vaultId, unknownEventPolicy: "ignore" },
  );
  assert.equal(state.quarantined.length, 0);
  assert.equal(state.lastAppliedVersion, 1);
});

test("SyncReplayEngine quarantines and ignores unsupported schemas by policy", async () => {
  const vaultId = testEntityId();
  const itemId = testEntityId();
  const row = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    itemId,
    vaultId,
    title: "A",
    categoryId: "login",
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [{ id: "s-main", title: "Main", order: 0, isPreset: true }],
    fields: [],
  };
  const event = baseWire({
    vaultId,
    eventType: "ITEM_CREATE",
    version: 1,
    payloadSchemaVersion: 999,
    encryptedPayload: opaqueJson(row),
  });

  const quarantined = await replayVaultEvents([event], {
    vaultId,
    decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    unsupportedSchemaPolicy: "quarantine",
  });
  assert.equal(quarantined.quarantined.length, 1);
  assert.equal(quarantined.quarantined[0]?.reason, "UNSUPPORTED_PAYLOAD_SCHEMA_VERSION");

  const ignored = await replayVaultEvents([event], {
    vaultId,
    decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    unsupportedSchemaPolicy: "ignore",
  });
  assert.equal(ignored.quarantined.length, 0);
  assert.equal(ignored.items.size, 0);
});

test("fixture stream JSON replays to expected materialized state", async () => {
  const fixture = await readJsonFixture<{
    vaultId: string;
    currentUserId: string;
    events: FixtureStreamEvent[];
  }>("stream-basic.json");
  const expected = await readJsonFixture<{
    lastAppliedVersion: number;
    items: Array<{ itemId: string; title: string }>;
    vaultLifecycle: { latestShareVersion: number | null };
    deviceLifecycle: { latestAddVersion: number | null };
    quarantinedReasons: string[];
  }>("expected-basic-state.json");

  const state = await replayVaultEvents(materializeFixtureEvents(fixture.events), {
    vaultId: fixture.vaultId,
    currentUserId: fixture.currentUserId,
    decryptItemPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    decryptPersonalMetadataPayload: async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  });

  const items = [...state.items.values()]
    .map((it) => ({ itemId: it.itemId, title: it.title }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  assert.equal(state.lastAppliedVersion, expected.lastAppliedVersion);
  assert.deepEqual(items, expected.items);
  assert.equal(state.vaultLifecycle.latestShareVersion, expected.vaultLifecycle.latestShareVersion);
  assert.equal(state.deviceLifecycle.latestAddVersion, expected.deviceLifecycle.latestAddVersion);
  assert.deepEqual(
    state.quarantined.map((q) => q.reason).sort(),
    expected.quarantinedReasons.sort(),
  );
});

test("SyncReplayEngine enforces signature policy when requiredSignatureEventTypes is configured", async () => {
  const vaultId = testEntityId();
  const engine = new SyncReplayEngine({
    vaultId,
    requiredSignatureEventTypes: ["VAULT_SHARE"],
  });

  await assert.rejects(
    () =>
      engine.applyEvents([
        baseWire({
          vaultId,
          eventType: "VAULT_SHARE",
          version: 1,
        }),
      ]),
    (error: unknown) => error instanceof SignatureValidationError,
  );
});

test("SyncReplayEngine rejects altered signature when verify hook is enabled", async () => {
  const vaultId = testEntityId();
  const event = baseWire({
    vaultId,
    eventType: "VAULT_SHARE",
    version: 1,
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: opaqueJson({}),
      meta: {
        signature: {
          version: 1,
          algorithm: "hybrid_ed25519_pq_bind_v1",
          key_id: "k1",
          context: "vault.share",
          signer_pq_public_key: "cHE=",
          payload_hash: "aGFzaA==",
          signature: "tampered-signature",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    },
  });

  const engine = new SyncReplayEngine({
    vaultId,
    requiredSignatureEventTypes: ["VAULT_SHARE"],
    verifyEventSignature: ({ envelope }) => envelope.signature === "expected-signature",
  });

  await assert.rejects(
    () => engine.applyEvents([event]),
    (error: unknown) => error instanceof SignatureValidationError,
  );
});
