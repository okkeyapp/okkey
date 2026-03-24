import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  replayFolderAndAssignEvents,
  wouldIntroduceFolderParentCycle,
} from "../../../packages/sync/dist/index.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
} from "../../../packages/types/dist/index.js";
import type { SyncEventWireDto } from "../../../packages/types/dist/index.js";

function opaqueJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function baseWire(
  partial: Partial<SyncEventWireDto> & Pick<SyncEventWireDto, "eventType" | "version" | "actorId">,
): SyncEventWireDto {
  const id = partial.id ?? randomUUID();
  return {
    id,
    vaultId: partial.vaultId ?? "00000000-0000-4000-8000-000000000001",
    actorId: partial.actorId,
    eventType: partial.eventType,
    encryptedPayload: partial.encryptedPayload ?? opaqueJson({}),
    payloadSchemaVersion: partial.payloadSchemaVersion ?? 1,
    idempotencyKey: partial.idempotencyKey ?? null,
    clientCreatedAt: partial.clientCreatedAt ?? null,
    version: partial.version,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("wouldIntroduceFolderParentCycle detects self and ancestor loop", () => {
  const a = randomUUID();
  const b = randomUUID();
  const c = randomUUID();
  const m = new Map([
    [a, { parentFolderId: null as string | null }],
    [b, { parentFolderId: a }],
    [c, { parentFolderId: b }],
  ]);
  assert.equal(wouldIntroduceFolderParentCycle(m, a, a), true);
  assert.equal(wouldIntroduceFolderParentCycle(m, a, c), true);
  assert.equal(wouldIntroduceFolderParentCycle(m, c, null), false);
  assert.equal(wouldIntroduceFolderParentCycle(m, c, a), false);
});

test("replayFolderAndAssignEvents applies folder and assign for matching actor", async () => {
  const vaultId = randomUUID();
  const userId = randomUUID();
  const folderId = randomUUID();
  const itemId = randomUUID();
  const now = Date.now();

  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId,
    vaultId,
    name: "Work",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const assignRow = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
    itemId,
    vaultId,
    folderId,
  };

  const events: SyncEventWireDto[] = [
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(folderRow),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 1,
      idempotencyKey: randomUUID(),
    }),
    baseWire({
      eventType: "ITEM_FOLDER_ASSIGN",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(assignRow),
      payloadSchemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
      version: 2,
    }),
  ];

  const state = await replayFolderAndAssignEvents(events, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.folders.get(folderId)?.name, "Work");
  assert.equal(state.itemFolder.get(itemId), folderId);
});

test("replayFolderAndAssignEvents skips events from other actors", async () => {
  const vaultId = randomUUID();
  const userId = randomUUID();
  const other = randomUUID();
  const folderId = randomUUID();
  const now = Date.now();
  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId,
    vaultId,
    name: "Hidden",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const events: SyncEventWireDto[] = [
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: other,
      vaultId,
      encryptedPayload: opaqueJson(folderRow),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 1,
      idempotencyKey: randomUUID(),
    }),
  ];

  const state = await replayFolderAndAssignEvents(events, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.folders.size, 0);
});

test("replayFolderAndAssignEvents preserves nested parentFolderId", async () => {
  const vaultId = randomUUID();
  const userId = randomUUID();
  const parentId = randomUUID();
  const childId = randomUUID();
  const now = Date.now();

  const parentRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: parentId,
    vaultId,
    name: "P",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };
  const childRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId: childId,
    vaultId,
    name: "C",
    parentFolderId: parentId,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const events: SyncEventWireDto[] = [
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(parentRow),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 1,
      idempotencyKey: randomUUID(),
    }),
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(childRow),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 2,
      idempotencyKey: randomUUID(),
    }),
  ];

  const state = await replayFolderAndAssignEvents(events, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.folders.get(parentId)?.name, "P");
  assert.equal(state.folders.get(childId)?.parentFolderId, parentId);
});

test("replayFolderAndAssignEvents clears assignments when folder is deleted", async () => {
  const vaultId = randomUUID();
  const userId = randomUUID();
  const folderId = randomUUID();
  const itemId = randomUUID();
  const now = Date.now();

  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
    folderId,
    vaultId,
    name: "Tmp",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };
  const assignRow = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
    itemId,
    vaultId,
    folderId,
  };
  const tombstone = {
    ...folderRow,
    name: "",
    createdAtMs: 0,
    updatedAtMs: now + 1,
    deleted: true,
  };

  const events: SyncEventWireDto[] = [
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(folderRow),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 1,
      idempotencyKey: randomUUID(),
    }),
    baseWire({
      eventType: "ITEM_FOLDER_ASSIGN",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(assignRow),
      payloadSchemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
      version: 2,
    }),
    baseWire({
      eventType: "FOLDER_DELETE",
      actorId: userId,
      vaultId,
      encryptedPayload: opaqueJson(tombstone),
      payloadSchemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION,
      version: 3,
    }),
  ];

  const state = await replayFolderAndAssignEvents(events, vaultId, userId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.folders.has(folderId), false);
  assert.equal(state.itemFolder.get(itemId), null);
});
