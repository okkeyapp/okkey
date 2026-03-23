import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { replayItemPlaintextEvents } from "../../../packages/sync/dist/index.js";
import { ITEM_PLAINTEXT_SCHEMA_VERSION } from "../../../packages/types/dist/index.js";
import type { ItemPlaintextV1 } from "../../../packages/types/dist/index.js";
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
function encodeItemPlaintextOpaqueBase64(item: ItemPlaintextV1): string {
  return Buffer.from(JSON.stringify(item), "utf8").toString("base64");
}

test("integration: item events append, list, replay, idempotency (opaque payload)", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `item-sync-${suffix}@okkey.local`;

  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
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

  const itemId = randomUUID();
  const idem = randomUUID();
  const now = Date.now();
  const item: ItemPlaintextV1 = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId,
    vaultId,
    title: "Secret title",
    createdAtMs: now,
    updatedAtMs: now,
  };

  const opaqueB64 = encodeItemPlaintextOpaqueBase64(item);
  const created = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedPayload: opaqueB64,
    baseVersion: 0,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    idempotencyKey: idem,
  });
  assert.equal(created.eventType, "ITEM_CREATE");
  assert.equal(created.version, 1);
  assert.equal(created.payloadSchemaVersion, 1);
  assert.equal(created.idempotencyKey, idem);

  const retry = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_CREATE",
    encryptedPayload: opaqueB64,
    baseVersion: 0,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    idempotencyKey: idem,
  });
  assert.equal(retry.id, created.id);
  assert.equal(retry.version, 1);

  await assert.rejects(
    () =>
      syncService.appendEvent(vaultId, userId, {
        eventType: "ITEM_UPDATE",
        encryptedPayload: encodeItemPlaintextOpaqueBase64({
          ...item,
          title: "stale-base-version",
        }),
        baseVersion: 0,
        payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
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

  const updatedItem: ItemPlaintextV1 = { ...item, title: "Renamed", updatedAtMs: now + 1 };
  const up = await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_UPDATE",
    encryptedPayload: encodeItemPlaintextOpaqueBase64(updatedItem),
    baseVersion: 1,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
  });
  assert.equal(up.version, 2);

  const listed2 = await syncService.listEvents(vaultId, userId, 0);
  const replay2 = await replayItemPlaintextEvents(listed2, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay2.items.get(itemId)?.title, "Renamed");

  const tombstone: ItemPlaintextV1 = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId,
    vaultId,
    title: "",
    createdAtMs: 0,
    updatedAtMs: Date.now(),
    deleted: true,
  };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_DELETE",
    encryptedPayload: encodeItemPlaintextOpaqueBase64(tombstone),
    baseVersion: 2,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
  });

  const listed3 = await syncService.listEvents(vaultId, userId, 0);
  const replay3 = await replayItemPlaintextEvents(listed3, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay3.items.has(itemId), false);
});
