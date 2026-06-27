import type { CoreClient } from "@okkey/api";
import {
  decryptPersonalVaultMetadataPayload,
  derivePersonalWorkspaceMetadataKey,
  wipeBytes,
} from "@okkey/crypto";
import { generateEntityId } from "@okkey/types";
import type { FolderPlaintextV2, SyncAppendEventRequestDto } from "@okkey/types";
import {
  buildFolderCreateAppendRequest,
  buildFolderDeleteAppendRequest,
  buildFolderUpdateAppendRequest,
  buildItemFolderAssignAppendRequest,
  replayWorkspaceFolderEvents,
  WorkspacePersonalOutboxClient,
  type WorkspaceFolderReplayState,
} from "@okkey/sync";

import { base64ToBytes } from "../auth/base64";
import {
  diffWorkspaceFolderTrees,
  rowsToWorkspaceTree,
  type FolderTreeMutation,
} from "./folderTreeCommit";
import type { WorkspaceFolderNode } from "./workspaceFolderTree";
import { flattenWorkspaceFolders } from "./workspaceFolderTree";
import { IndexedDbWorkspacePersonalOutboxStore } from "./workspacePersonalOutboxStore";

const CACHE_DB = "okkey-workspace-personal-sync";
const CACHE_STORE = "materialized_state";

type CachedMaterializedState = {
  key: string;
  lastAppliedVersion: number;
  folders: Array<[string, FolderPlaintextV2]>;
  itemFolder: Array<[string, string | null]>;
};

function cacheKey(userId: string, workspaceId: string): string {
  return `okkey.workspace-personal-sync.v1.u.${userId}.w.${workspaceId}`;
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("INDEXEDDB_UNAVAILABLE"));
      return;
    }
    const req = globalThis.indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

async function readCachedState(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceFolderReplayState | null> {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(CACHE_STORE, "readonly");
    const store = tx.objectStore(CACHE_STORE);
    const req = store.get(cacheKey(userId, workspaceId));
    const row = await new Promise<CachedMaterializedState | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as CachedMaterializedState | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row) {
      return null;
    }
    return {
      folders: new Map(row.folders),
      itemFolder: new Map(row.itemFolder),
      lastAppliedVersion: row.lastAppliedVersion,
    };
  } catch {
    return null;
  }
}

async function writeCachedState(
  userId: string,
  workspaceId: string,
  state: WorkspaceFolderReplayState,
): Promise<void> {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(CACHE_STORE, "readwrite");
    const store = tx.objectStore(CACHE_STORE);
    store.put({
      key: cacheKey(userId, workspaceId),
      lastAppliedVersion: state.lastAppliedVersion,
      folders: [...state.folders.entries()],
      itemFolder: [...state.itemFolder.entries()],
    } satisfies CachedMaterializedState);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // cache is best-effort
  }
}

export type WorkspaceFoldersSyncController = {
  refresh: () => Promise<WorkspaceFolderReplayState>;
  drainOutbox: () => Promise<void>;
  createFolder: (label: string) => Promise<string>;
  commitFolderTree: (nextTree: readonly WorkspaceFolderNode[]) => Promise<void>;
  assignItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  getState: () => WorkspaceFolderReplayState;
  toFolderTree: () => WorkspaceFolderNode[];
  dispose: () => void;
};

export function createWorkspaceFoldersSyncController(input: {
  core: CoreClient;
  userId: string;
  workspaceId: string;
  passwordShareC: Uint8Array;
}): WorkspaceFoldersSyncController {
  let state: WorkspaceFolderReplayState = {
    folders: new Map(),
    itemFolder: new Map(),
    lastAppliedVersion: 0,
  };
  let metadataKey: Uint8Array | null = null;
  let metadataKeyReady: Promise<Uint8Array> | null = null;

  const outbox = new WorkspacePersonalOutboxClient(
    new IndexedDbWorkspacePersonalOutboxStore(input.userId, input.workspaceId),
    {
      appendWorkspacePersonalEvent: (workspaceId, body) =>
        input.core.appendWorkspacePersonalEvent(workspaceId, body),
      listWorkspacePersonalEvents: (workspaceId, afterVersion) =>
        input.core.listWorkspacePersonalEvents(workspaceId, afterVersion),
    },
    {
      decryptPersonalMetadataPayload: async (payloadBase64) => {
        const key = await ensureMetadataKey();
        return decryptPersonalVaultMetadataPayload(key, base64ToBytes(payloadBase64));
      },
    },
  );

  async function ensureMetadataKey(): Promise<Uint8Array> {
    if (metadataKey) {
      return metadataKey;
    }
    if (!metadataKeyReady) {
      metadataKeyReady = derivePersonalWorkspaceMetadataKey(
        input.passwordShareC,
        input.workspaceId,
      ).then((key) => {
        metadataKey = key;
        return key;
      });
    }
    return metadataKeyReady;
  }

  async function replayIncremental(fromVersion: number): Promise<void> {
    const key = await ensureMetadataKey();
    const page = await input.core.listWorkspacePersonalEvents(input.workspaceId, fromVersion);
    if (!page.events.length) {
      return;
    }
    const next = await replayWorkspaceFolderEvents(
      page.events,
      input.workspaceId,
      async (b64) => decryptPersonalVaultMetadataPayload(key, base64ToBytes(b64)),
      fromVersion,
      state,
    );
    state = next;
    await writeCachedState(input.userId, input.workspaceId, state);
  }

  async function refresh(): Promise<WorkspaceFolderReplayState> {
    const cached = await readCachedState(input.userId, input.workspaceId);
    if (cached) {
      state = cached;
    }
    await replayIncremental(state.lastAppliedVersion);
    return state;
  }

  async function enqueue(request: SyncAppendEventRequestDto): Promise<void> {
    await outbox.enqueue({
      workspaceId: input.workspaceId,
      request,
    });
    await outbox.drain(input.workspaceId);
    await replayIncremental(state.lastAppliedVersion);
  }

  async function applyMutations(
    mutations: FolderTreeMutation[],
    baseVersionStart: number,
  ): Promise<void> {
    const key = await ensureMetadataKey();
    let version = baseVersionStart;
    for (const mutation of mutations) {
      let request: SyncAppendEventRequestDto;
      if (mutation.kind === "create") {
        request = await buildFolderCreateAppendRequest(
          key,
          mutation.folder,
          version,
          mutation.idempotencyKey,
        );
      } else if (mutation.kind === "update") {
        request = await buildFolderUpdateAppendRequest(key, mutation.folder, version);
      } else {
        request = await buildFolderDeleteAppendRequest(key, mutation.tombstone, version);
      }
      await outbox.enqueue({ workspaceId: input.workspaceId, request });
      version += 1;
    }
    await outbox.drain(input.workspaceId);
    await replayIncremental(state.lastAppliedVersion);
  }

  return {
    getState: () => state,
    toFolderTree: () => rowsToWorkspaceTree(state.folders),
    refresh,
    drainOutbox: async () => {
      await outbox.drain(input.workspaceId);
      await replayIncremental(state.lastAppliedVersion);
    },
    createFolder: async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return "";
      }
      const key = await ensureMetadataKey();
      const nowMs = Date.now();
      const id = generateEntityId();
      const folder: FolderPlaintextV2 = {
        schemaVersion: 2,
        folderId: id,
        workspaceId: input.workspaceId,
        name: trimmed,
        parentFolderId: null,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };
      const request = await buildFolderCreateAppendRequest(
        key,
        folder,
        state.lastAppliedVersion,
        generateEntityId(),
      );
      await enqueue(request);
      return id;
    },
    commitFolderTree: async (nextTree) => {
      const mutations = diffWorkspaceFolderTrees({
        workspaceId: input.workspaceId,
        previous: state.folders,
        nextTree,
        nowMs: Date.now(),
      });
      if (!mutations.length) {
        return;
      }
      await applyMutations(mutations, state.lastAppliedVersion);
    },
    assignItemToFolder: async (itemId, folderId) => {
      const key = await ensureMetadataKey();
      const request = await buildItemFolderAssignAppendRequest(
        key,
        {
          schemaVersion: 2,
          itemId,
          workspaceId: input.workspaceId,
          folderId,
        },
        state.lastAppliedVersion,
      );
      await enqueue(request);
    },
    dispose: () => {
      if (metadataKey) {
        wipeBytes(metadataKey);
        metadataKey = null;
      }
    },
  };
}

export function replayStateToFlatFolders(state: WorkspaceFolderReplayState) {
  return flattenWorkspaceFolders(rowsToWorkspaceTree(state.folders));
}
