import test from "node:test";
import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import {
  replayWorkspaceFolderEvents,
  wouldIntroduceFolderParentCycle,
} from "../../../packages/sync/dist/index.js";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
} from "../../../packages/types/dist/index.js";
import type { WorkspacePersonalEventWireDto } from "../../../packages/types/dist/index.js";

function opaqueJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function baseWire(
  partial: Partial<WorkspacePersonalEventWireDto> &
    Pick<WorkspacePersonalEventWireDto, "eventType" | "version" | "actorId">,
): WorkspacePersonalEventWireDto {
  const id = partial.id ?? testEntityId();
  return {
    id,
    workspaceId: partial.workspaceId ?? "1156820912149101",
    actorId: partial.actorId,
    eventType: partial.eventType,
    encryptedBlob: partial.encryptedBlob ?? {
      crypto_version: 2,
      algorithm: "opaque",
      payload: opaqueJson({}),
      meta: {},
    },
    idempotencyKey: partial.idempotencyKey ?? null,
    clientCreatedAt: partial.clientCreatedAt ?? null,
    version: partial.version,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("wouldIntroduceFolderParentCycle detects self and ancestor loop", () => {
  const a = testEntityId();
  const b = testEntityId();
  const c = testEntityId();
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

test("replayWorkspaceFolderEvents applies folder and assign events", async () => {
  const workspaceId = testEntityId();
  const userId = testEntityId();
  const folderId = testEntityId();
  const itemId = testEntityId();
  const now = Date.now();

  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId,
    name: "Work",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const assignRow = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
    itemId,
    workspaceId,
    folderId,
  };

  const events: WorkspacePersonalEventWireDto[] = [
    baseWire({
      eventType: "FOLDER_CREATE",
      actorId: userId,
      workspaceId,
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: opaqueJson(folderRow),
        meta: {},
      },
      version: 1,
      idempotencyKey: testEntityId(),
    }),
    baseWire({
      eventType: "ITEM_FOLDER_ASSIGN",
      actorId: userId,
      workspaceId,
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: opaqueJson(assignRow),
        meta: {},
      },
      version: 2,
    }),
  ];

  const state = await replayWorkspaceFolderEvents(events, workspaceId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.folders.get(folderId)?.name, "Work");
  assert.equal(state.itemFolder.get(itemId), folderId);
});

test("replayWorkspaceFolderEvents applies item favorite set events", async () => {
  const workspaceId = testEntityId();
  const userId = testEntityId();
  const itemId = testEntityId();

  const favoriteRow = {
    schemaVersion: 2,
    itemId,
    workspaceId,
    favorite: true,
  };

  const unfavoriteRow = {
    schemaVersion: 2,
    itemId,
    workspaceId,
    favorite: false,
  };

  const events: WorkspacePersonalEventWireDto[] = [
    baseWire({
      eventType: "ITEM_FAVORITE_SET",
      actorId: userId,
      workspaceId,
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: opaqueJson(favoriteRow),
        meta: {},
      },
      version: 1,
    }),
    baseWire({
      eventType: "ITEM_FAVORITE_SET",
      actorId: userId,
      workspaceId,
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: opaqueJson(unfavoriteRow),
        meta: {},
      },
      version: 2,
    }),
  ];

  const state = await replayWorkspaceFolderEvents(events, workspaceId, async (b64) =>
    Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(state.itemFavorite.has(itemId), false);

  const favoritedOnly = await replayWorkspaceFolderEvents(
    [events[0]!],
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );
  assert.equal(favoritedOnly.itemFavorite.has(itemId), true);
});

test("replayWorkspaceFolderEvents ignores other workspace ids", async () => {
  const workspaceId = testEntityId();
  const otherWorkspaceId = testEntityId();
  const userId = testEntityId();
  const folderId = testEntityId();
  const now = Date.now();

  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId: otherWorkspaceId,
    name: "Foreign",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const state = await replayWorkspaceFolderEvents(
    [
      baseWire({
        eventType: "FOLDER_CREATE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(folderRow),
          meta: {},
        },
        version: 1,
      }),
    ],
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );

  assert.equal(state.folders.size, 0);
});

test("replayWorkspaceFolderEvents supports nested folders", async () => {
  const workspaceId = testEntityId();
  const userId = testEntityId();
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
  const childRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId: childId,
    workspaceId,
    name: "Child",
    parentFolderId: parentId,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const state = await replayWorkspaceFolderEvents(
    [
      baseWire({
        eventType: "FOLDER_CREATE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(parentRow),
          meta: {},
        },
        version: 1,
      }),
      baseWire({
        eventType: "FOLDER_CREATE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(childRow),
          meta: {},
        },
        version: 2,
      }),
    ],
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );

  assert.equal(state.folders.get(childId)?.parentFolderId, parentId);
});

test("replayWorkspaceFolderEvents delete clears assignments", async () => {
  const workspaceId = testEntityId();
  const userId = testEntityId();
  const folderId = testEntityId();
  const itemId = testEntityId();
  const now = Date.now();

  const folderRow = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId,
    name: "Temp",
    parentFolderId: null,
    createdAtMs: now,
    updatedAtMs: now,
    deleted: true,
  };
  const assignRow = {
    schemaVersion: ITEM_FOLDER_ASSIGN_SCHEMA_VERSION_V2,
    itemId,
    workspaceId,
    folderId,
  };

  const state = await replayWorkspaceFolderEvents(
    [
      baseWire({
        eventType: "FOLDER_CREATE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson({
            ...folderRow,
            deleted: undefined,
          }),
          meta: {},
        },
        version: 1,
      }),
      baseWire({
        eventType: "ITEM_FOLDER_ASSIGN",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(assignRow),
          meta: {},
        },
        version: 2,
      }),
      baseWire({
        eventType: "FOLDER_DELETE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(folderRow),
          meta: {},
        },
        version: 3,
      }),
    ],
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
  );

  assert.equal(state.folders.has(folderId), false);
  assert.equal(state.itemFolder.get(itemId), null);
});

test("replayWorkspaceFolderEvents applies delete on top of initial materialized state", async () => {
  const workspaceId = testEntityId();
  const userId = testEntityId();
  const folderId = testEntityId();
  const keepId = testEntityId();
  const now = Date.now();

  const initialFolders = new Map([
    [
      folderId,
      {
        schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
        folderId,
        workspaceId,
        name: "Gone",
        parentFolderId: null,
        createdAtMs: now,
        updatedAtMs: now,
      },
    ],
    [
      keepId,
      {
        schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
        folderId: keepId,
        workspaceId,
        name: "Keep",
        parentFolderId: null,
        createdAtMs: now,
        updatedAtMs: now,
      },
    ],
  ]);

  const tombstone = {
    schemaVersion: FOLDER_PLAINTEXT_SCHEMA_VERSION_V2,
    folderId,
    workspaceId,
    name: "",
    parentFolderId: null,
    createdAtMs: 0,
    updatedAtMs: now + 1,
    deleted: true,
  };

  const state = await replayWorkspaceFolderEvents(
    [
      baseWire({
        eventType: "FOLDER_DELETE",
        actorId: userId,
        workspaceId,
        encryptedBlob: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: opaqueJson(tombstone),
          meta: {},
        },
        version: 2,
      }),
    ],
    workspaceId,
    async (b64) => Uint8Array.from(Buffer.from(b64, "base64")),
    1,
    { folders: initialFolders, itemFolder: new Map() },
  );

  assert.equal(state.folders.has(folderId), false);
  assert.equal(state.folders.get(keepId)?.name, "Keep");
  assert.equal(state.lastAppliedVersion, 2);
});
