import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { replayFolderAndAssignEvents } from "../../../packages/sync/dist/index.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
} from "../../../packages/types/dist/index.js";
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

function encodeFolderOpaqueBase64(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function mkBlobFromJson(payload: unknown, cryptoVersion: number) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: encodeFolderOpaqueBase64(payload),
    meta: {},
  };
}

test("integration: folder events append, idempotency, list, replay", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `folder-sync-${suffix}@okkey.local`;

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

  const folderId = randomUUID();
  const idem = randomUUID();
  const now = Date.now();
  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId,
    vaultId,
    name: "Docs",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const created = await syncService.appendEvent(vaultId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(folderRow, FOLDER_PLAINTEXT_SCHEMA_VERSION),
    baseVersion: 0,
    idempotencyKey: idem,
  });
  assert.equal(created.eventType, "FOLDER_CREATE");
  assert.equal(created.version, 1);
  assert.equal(created.actorId, userId);

  const retry = await syncService.appendEvent(vaultId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(folderRow, FOLDER_PLAINTEXT_SCHEMA_VERSION),
    baseVersion: 0,
    idempotencyKey: idem,
  });
  assert.equal(retry.id, created.id);
  assert.equal(retry.version, 1);

  await assert.rejects(
    () =>
      syncService.appendEvent(vaultId, userId, {
        eventType: "FOLDER_CREATE",
        encryptedBlob: mkBlobFromJson(folderRow, FOLDER_PLAINTEXT_SCHEMA_VERSION),
        baseVersion: 0,
      }),
    (e: unknown) => e instanceof SyncServiceError && e.code === "SYNC_BAD_REQUEST",
  );

  const itemId = randomUUID();
  const assign = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
    itemId,
    vaultId,
    folderId,
  };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "ITEM_FOLDER_ASSIGN",
    encryptedBlob: mkBlobFromJson(assign, ITEM_FOLDER_ASSIGN_SCHEMA_VERSION),
    baseVersion: 1,
  });

  const listed = await syncService.listEvents(vaultId, userId, 0);
  assert.equal(listed.length, 2);

  const replay = await replayFolderAndAssignEvents(listed, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay.folders.get(folderId)?.name, "Docs");
  assert.equal(replay.itemFolder.get(itemId), folderId);
});

test("integration: nested folders and VERSION_MISMATCH on stale baseVersion", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `folder-sync-nested-${suffix}@okkey.local`;

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
  const vaultId = vaults[0]!.id;

  const parentId = randomUUID();
  const childId = randomUUID();
  const now = Date.now();

  const parentRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: parentId,
    vaultId,
    name: "Parent",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(parentRow, FOLDER_PLAINTEXT_SCHEMA_VERSION),
    baseVersion: 0,
    idempotencyKey: randomUUID(),
  });

  const childRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: childId,
    vaultId,
    name: "Child",
    parentFolderId: parentId,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(childRow, FOLDER_PLAINTEXT_SCHEMA_VERSION),
    baseVersion: 1,
    idempotencyKey: randomUUID(),
  });

  const listedMid = await syncService.listEvents(vaultId, userId, 0);
  assert.equal(listedMid.length, 2);
  const replayMid = await replayFolderAndAssignEvents(listedMid, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replayMid.folders.get(childId)?.parentFolderId, parentId);

  const renamedParent = { ...parentRow, name: "ParentRenamed", updatedAtMs: now + 1 };
  await syncService.appendEvent(vaultId, userId, {
    eventType: "FOLDER_UPDATE",
    encryptedBlob: mkBlobFromJson(renamedParent, FOLDER_PLAINTEXT_SCHEMA_VERSION),
    baseVersion: 2,
  });

  await assert.rejects(
    () =>
      syncService.appendEvent(vaultId, userId, {
        eventType: "FOLDER_UPDATE",
        encryptedBlob: mkBlobFromJson(
          {
            ...parentRow,
            name: "Conflict",
            updatedAtMs: now + 2,
          },
          FOLDER_PLAINTEXT_SCHEMA_VERSION,
        ),
        baseVersion: 2,
      }),
    (e: unknown) => e instanceof SyncServiceError && e.code === "VERSION_MISMATCH",
  );

  const listed = await syncService.listEvents(vaultId, userId, 0);
  assert.equal(listed.length, 3);
  const replay = await replayFolderAndAssignEvents(listed, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay.folders.get(parentId)?.name, "ParentRenamed");
});
