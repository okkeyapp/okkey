import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { replayWorkspaceFolderEvents } from "../../../packages/sync/dist/index.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
} from "../../../packages/types/dist/index.js";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  WorkspacePersonalSyncService,
  WorkspacePersonalSyncServiceError,
} from "../src/workspace-personal-sync/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

function encodeFolderOpaqueBase64(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

const FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION = 2;

function mkBlobFromJson(payload: unknown, cryptoVersion: number) {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: encodeFolderOpaqueBase64(payload),
    meta: {},
  };
}

function toWireEvents(
  workspaceId: string,
  listed: Array<{
    id: string;
    actorId: string;
    eventType: string;
    encryptedBlob: { crypto_version: number; payload: string };
    idempotencyKey: string | null;
    clientCreatedAt: string | null;
    version: number;
    createdAt: string;
  }>,
) {
  return listed.map((event) => ({
    id: event.id,
    workspaceId,
    actorId: event.actorId,
    eventType: event.eventType,
    encryptedBlob: event.encryptedBlob,
    idempotencyKey: event.idempotencyKey,
    clientCreatedAt: event.clientCreatedAt,
    version: event.version,
    createdAt: event.createdAt,
  }));
}

test("integration: workspace personal folder events append, idempotency, list, replay", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `folder-sync-${suffix}@okkey.local`;

  const syncService = new WorkspacePersonalSyncService({
    workspaces: storage.repositories.workspaces,
    events: storage.repositories.workspacePersonalEvents,
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

  const folderId = testEntityId();
  const idem = testEntityId();
  const now = Date.now();
  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId,
    name: "Docs",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const created = await syncService.appendEvent(workspaceId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(folderRow, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 0,
    idempotencyKey: idem,
  });
  assert.equal(created.eventType, "FOLDER_CREATE");
  assert.equal(created.version, 1);
  assert.equal(created.actorId, userId);

  const retry = await syncService.appendEvent(workspaceId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(folderRow, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 0,
    idempotencyKey: idem,
  });
  assert.equal(retry.id, created.id);
  assert.equal(retry.version, 1);

  await assert.rejects(
    () =>
      syncService.appendEvent(workspaceId, userId, {
        eventType: "FOLDER_CREATE",
        encryptedBlob: mkBlobFromJson(folderRow, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
        baseVersion: 0,
      }),
    (e: unknown) => e instanceof WorkspacePersonalSyncServiceError && e.code === "SYNC_BAD_REQUEST",
  );

  const itemId = testEntityId();
  const assign = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
    itemId,
    workspaceId,
    folderId,
  };
  await syncService.appendEvent(workspaceId, userId, {
    eventType: "ITEM_FOLDER_ASSIGN",
    encryptedBlob: mkBlobFromJson(assign, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 1,
  });

  const listed = await syncService.listEvents(workspaceId, userId, 0);
  assert.equal(listed.length, 2);

  const replay = await replayWorkspaceFolderEvents(
    toWireEvents(workspaceId, listed),
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay.folders.get(folderId)?.name, "Docs");
  assert.equal(replay.itemFolder.get(itemId), folderId);
});

test("integration: nested workspace folders and VERSION_MISMATCH on stale baseVersion", async (t) => {
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = testEntityId();
  const email = `folder-sync-nested-${suffix}@okkey.local`;

  const syncService = new WorkspacePersonalSyncService({
    workspaces: storage.repositories.workspaces,
    events: storage.repositories.workspacePersonalEvents,
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

  const parentId = testEntityId();
  const childId = testEntityId();
  const now = Date.now();

  const parentRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId: parentId,
    workspaceId,
    name: "Parent",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await syncService.appendEvent(workspaceId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(parentRow, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 0,
    idempotencyKey: testEntityId(),
  });

  const childRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId: childId,
    workspaceId,
    name: "Child",
    parentFolderId: parentId,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await syncService.appendEvent(workspaceId, userId, {
    eventType: "FOLDER_CREATE",
    encryptedBlob: mkBlobFromJson(childRow, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 1,
    idempotencyKey: testEntityId(),
  });

  const listedMid = await syncService.listEvents(workspaceId, userId, 0);
  assert.equal(listedMid.length, 2);
  const replayMid = await replayWorkspaceFolderEvents(
    toWireEvents(workspaceId, listedMid),
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replayMid.folders.get(childId)?.parentFolderId, parentId);

  const renamedParent = { ...parentRow, name: "ParentRenamed", updatedAtMs: now + 1 };
  await syncService.appendEvent(workspaceId, userId, {
    eventType: "FOLDER_UPDATE",
    encryptedBlob: mkBlobFromJson(renamedParent, FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION),
    baseVersion: 2,
  });

  await assert.rejects(
    () =>
      syncService.appendEvent(workspaceId, userId, {
        eventType: "FOLDER_UPDATE",
        encryptedBlob: mkBlobFromJson(
          {
            ...parentRow,
            name: "Conflict",
            updatedAtMs: now + 2,
          },
          FOLDER_SYNC_ENVELOPE_CRYPTO_VERSION,
        ),
        baseVersion: 2,
      }),
    (e: unknown) =>
      e instanceof WorkspacePersonalSyncServiceError && e.code === "VERSION_MISMATCH",
  );

  const listed = await syncService.listEvents(workspaceId, userId, 0);
  assert.equal(listed.length, 3);
  const replay = await replayWorkspaceFolderEvents(
    toWireEvents(workspaceId, listed),
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(replay.folders.get(parentId)?.name, "ParentRenamed");
});
