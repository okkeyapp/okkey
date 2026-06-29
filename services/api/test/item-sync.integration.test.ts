import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { replayItemPlaintextEvents } from "../../../packages/sync/dist/index.js";
import {
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  createPresetItemPlaintextV2,
  ITEM_CATEGORY_LOGIN,
} from "../../../packages/types/dist/index.js";
import type { ItemPlaintextV2 } from "../../../packages/types/dist/index.js";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { VaultService } from "../src/vault/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

/**
 * Test-only “ciphertext”: server stores opaque bytes only. Production clients use
 * `encryptVaultItemPayload` (WASM); Node integration tests skip WASM fetch limitations.
 */
function encodeItemPlaintextOpaqueBase64(item: ItemPlaintextV2): string {
  return Buffer.from(JSON.stringify(item), "utf8").toString("base64");
}

function mkBlobFromItem(item: ItemPlaintextV2, cryptoVersion = ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: encodeItemPlaintextOpaqueBase64(item),
    meta: {},
  };
}

test("integration: item events append, list, replay, idempotency (opaque payload)", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `item-sync-${suffix}@okkey.local`;

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
  });

  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);

  const wsRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = wsRows[0]?.id;
  assert.ok(workspaceId);

  const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
  assert.ok(vaults.length >= 1);
  const vaultId = vaults[0].id;

  const itemId = testEntityId();
  const idem = testEntityId();
  const now = Date.now();
  const item: ItemPlaintextV2 = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId,
    vaultId,
    title: "Secret title",
    nowMs: now,
  });

  const created = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedBlob: mkBlobFromItem(item),
    baseVersion: 0,
    idempotencyKey: idem,
    referencedItemId: itemId,
  });
  assert.equal(created.eventType, "ITEM_CREATE");
  assert.equal(created.version, 1);
  assert.equal(created.payloadSchemaVersion, ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST);
  assert.equal(created.idempotencyKey, idem);

  const retry = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedBlob: mkBlobFromItem(item),
    baseVersion: 0,
    idempotencyKey: idem,
    referencedItemId: itemId,
  });
  assert.equal(retry.id, created.id);
  assert.equal(retry.version, 1);

  await assert.rejects(
    () =>
      syncService.appendEvent(vaultId, userId, {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlobFromItem({
          ...item,
          title: "stale-base-version",
        }),
        baseVersion: 0,
        referencedItemId: itemId,
      }),
    (e: unknown) => e instanceof SyncServiceError && e.code === "VERSION_MISMATCH",
  );

  const fetchA = await syncService.listEvents(vaultId, userId, 0);
  const fetchB = await syncService.listEvents(vaultId, userId, 0);
  assert.deepEqual(fetchA, fetchB);

  const countRows = await storage.postgres.query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM events WHERE vault_id = $1",
    [vaultId],
  );
  assert.equal(countRows[0]?.c, "1");

  const listed = await syncService.listEvents(vaultId, userId, 0);
  assert.equal(listed.length, 1);

  const replay = await replayItemPlaintextEvents(listed, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay.items.get(itemId)?.title, "Secret title");

  const updatedItem: ItemPlaintextV2 = { ...item, title: "Renamed", updatedAtMs: now + 1 };
  const up = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlobFromItem(updatedItem),
    baseVersion: 1,
    referencedItemId: itemId,
    itemSoftDeleted: false,
  });
  assert.equal(up.version, 2);

  const listed2 = await syncService.listEvents(vaultId, userId, 0);
  const replay2 = await replayItemPlaintextEvents(listed2, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay2.items.get(itemId)?.title, "Renamed");

  const deletedAtMs = now + 2;
  const softDeletedItem: ItemPlaintextV2 = {
    ...updatedItem,
    deleted: true,
    deletedAtMs,
    updatedAtMs: deletedAtMs,
  };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_UPDATE",
    encryptedBlob: mkBlobFromItem(softDeletedItem),
    baseVersion: 2,
    referencedItemId: itemId,
    itemSoftDeleted: true,
    itemDeletedAtMs: deletedAtMs,
  });

  const listed3 = await syncService.listEvents(vaultId, userId, 0);
  const replay3 = await replayItemPlaintextEvents(listed3, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  const replayed = replay3.items.get(itemId);
  assert.equal(replayed?.deleted, true);
  assert.equal(replayed?.title, "Renamed");
  assert.equal(replayed?.deletedAtMs, deletedAtMs);
});

test("integration: sync rejects payload schema downgrade after higher version in stream", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `item-sync-downgrade-${suffix}@okkey.local`;

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    config: {
      allowedCryptoProfileVersions: [1, 2],
      deployEnv: config.deployEnv,
    },
  });

  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);

  const wsRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = wsRows[0]?.id;
  assert.ok(workspaceId);

  const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
  const vaultId = vaults[0].id;

  const itemId = testEntityId();
  const idem = testEntityId();
  const now = Date.now();
  const item: ItemPlaintextV2 = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_LOGIN,
    itemId,
    vaultId,
    title: "Downgrade probe",
    nowMs: now,
  });

  await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedBlob: mkBlobFromItem(item, ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST),
    baseVersion: 0,
    idempotencyKey: idem,
    referencedItemId: itemId,
  });

  const weaker: ItemPlaintextV2 = { ...item, title: "weaker-crypto-version", updatedAtMs: now + 1 };
  await assert.rejects(
    () =>
      syncService.appendEvent(vaultId, userId, {
        eventType: "ITEM_UPDATE",
        encryptedBlob: mkBlobFromItem(weaker, 1),
        baseVersion: 1,
        referencedItemId: itemId,
      }),
    (e: unknown) =>
      e instanceof SyncServiceError && e.code === "CRYPTO_DOWNGRADE_NOT_ALLOWED",
  );
});
