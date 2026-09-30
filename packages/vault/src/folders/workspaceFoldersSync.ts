import type { CoreClient } from "@okkey/api";
import {
  decryptPersonalVaultMetadataPayload,
  derivePersonalWorkspaceMetadataKey,
  wipeBytes,
} from "@okkey/crypto";
import { createFolderDeleteTombstoneV2, generateEntityId, parseFolderPlaintextV2Utf8 } from "@okkey/types";
import type { FolderPlaintextV2, SyncAppendEventRequestDto } from "@okkey/types";
import {
  buildFolderCreateAppendRequest,
  buildFolderDeleteAppendRequest,
  buildFolderUpdateAppendRequest,
  buildItemFolderAssignAppendRequest,
  buildItemFavoriteSetAppendRequest,
  replayWorkspaceFolderEvents,
  WorkspacePersonalOutboxClient,
  type WorkspaceFolderReplayState,
} from "@okkey/sync";

import { base64ToBytes } from "../base64.js";
import {
  diffWorkspaceFolderTrees,
  rowsToWorkspaceTree,
  type FolderTreeMutation,
} from "./folderTreeCommit.js";
import type { WorkspaceFolderNode } from "./workspaceFolderTree.js";
import { flattenWorkspaceFolders } from "./workspaceFolderTree.js";
import { IndexedDbWorkspacePersonalOutboxStore } from "./workspacePersonalOutboxStore.js";
import { parsePersonalEventsVersionMismatch } from "./personalEventsVersionMismatch.js";
import { folderIdsToTombstoneForRebaseline } from "./shouldResealLocalFoldersForStreamKey.js";

const CACHE_DB = "okkey-workspace-personal-sync";
const CACHE_STORE = "materialized_state";
const RESEAL_APPEND_MAX_ATTEMPTS = 8;
/** Agent live-reseal test folder left on personal-events; remove on refresh. */
export const AGENT_REPAIR_PROBE_FOLDER_NAME = "extension-repair-probe";
const FOLDER_EVENT_TYPES = new Set(["FOLDER_CREATE", "FOLDER_UPDATE", "FOLDER_DELETE"]);

export { parsePersonalEventsVersionMismatch } from "./personalEventsVersionMismatch.js";
export {
  folderIdsToTombstoneForRebaseline,
  shouldResealLocalFoldersForStreamKey,
} from "./shouldResealLocalFoldersForStreamKey.js";

type CachedMaterializedState = {
  key: string;
  lastAppliedVersion: number;
  folders: Array<[string, FolderPlaintextV2]>;
  itemFolder: Array<[string, string | null]>;
  itemFavorite: string[];
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
      itemFavorite: new Set(row.itemFavorite ?? []),
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
      itemFavorite: [...state.itemFavorite],
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

/** Drop one workspace materialized folder cache so the next refresh does a full pull. */
export async function clearWorkspaceFoldersMaterializedCache(
  userId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).delete(cacheKey(userId, workspaceId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // cache is best-effort
  }
}

export type WorkspaceFoldersRefreshDiagnostics = {
  eventsFetched: number;
  decryptAttempts: number;
  decryptFailures: number;
  /** Always 0 on unlock/open/switch: full rematerialize from personal-events. */
  fromVersion: number;
  folderCount: number;
  /**
   * Always false for refresh: IndexedDB is never the bootstrap source of truth.
   * Kept for host diagnostics compatibility.
   */
  usedCache: boolean;
  /** Always false for refresh (API-first empty start). */
  resetPoisonedCache: boolean;
  /** Always false for refresh: no local-plaintext reseal on the hot path. */
  resealedStaleKey: boolean;
  /** True when agent `extension-repair-probe` folder(s) were tombstoned. */
  deletedRepairProbe: boolean;
  /** True only for the explicit opt-in `rebaselineFromLocalPlaintext` recovery path. */
  rebaselinedFromLocal: boolean;
  /** FOLDER_* events that failed AEAD during stream key health probe. */
  probeFolderDecryptFail: number;
  /** FOLDER_* events that decrypted during stream key health probe. */
  probeFolderDecryptOk: number;
  /** Server tip version after API rematerialize (lastAppliedVersion). */
  serverTipVersion: number;
};

export type WorkspaceFoldersSyncController = {
  /**
   * API-first rematerialize: empty local state → pull personal-events from
   * version 0 → decrypt → tree. IndexedDB is written only after a successful
   * API sync (optional offline cache), never used as UI source of truth.
   */
  refresh: () => Promise<WorkspaceFolderReplayState>;
  /**
   * Explicit opt-in recovery only (not used on unlock/open/switch). When the
   * personal-events stream is polluted with zombie folders under the current
   * key, uses IndexedDB plaintext on THIS origin to tombstone extras + reseal.
   * Prefer fixing the stream; do not call from the hot path.
   */
  rebaselineFromLocalPlaintext: () => Promise<WorkspaceFolderReplayState>;
  drainOutbox: () => Promise<void>;
  createFolder: (label: string, parentFolderId?: string | null) => Promise<string>;
  commitFolderTree: (nextTree: readonly WorkspaceFolderNode[]) => Promise<void>;
  assignItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  setItemFavorite: (itemId: string, favorite: boolean) => Promise<void>;
  setItemsFavorite: (itemIds: readonly string[], favorite: boolean) => Promise<void>;
  getState: () => WorkspaceFolderReplayState;
  getLastRefreshDiagnostics: () => WorkspaceFoldersRefreshDiagnostics | null;
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
    itemFavorite: new Set(),
    lastAppliedVersion: 0,
  };
  let metadataKey: Uint8Array | null = null;
  let metadataKeyReady: Promise<Uint8Array> | null = null;
  let lastRefreshDiagnostics: WorkspaceFoldersRefreshDiagnostics | null = null;

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

  async function replayIncremental(
    fromVersion: number,
  ): Promise<{ eventsFetched: number; decryptAttempts: number; decryptFailures: number }> {
    let cursor = fromVersion;
    let decryptAttempts = 0;
    let decryptFailures = 0;
    let eventsFetched = 0;
    // Mirror vault-items read: keep paging until the server returns an empty page.
    // (Personal-events currently returns the full remainder in one response, but
    // looping stays correct if a limit is introduced later.)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await input.core.listWorkspacePersonalEvents(input.workspaceId, cursor);
      if (!page.events.length) {
        break;
      }
      eventsFetched += page.events.length;
      // Derive metadata key only when there is ciphertext to decrypt — allows
      // serving an IndexedDB cache when WASM is not yet ready (extension popup
      // reopen), as long as there are no new personal events.
      const key = await ensureMetadataKey();
      const next = await replayWorkspaceFolderEvents(
        page.events,
        input.workspaceId,
        async (b64) => {
          decryptAttempts += 1;
          try {
            return await decryptPersonalVaultMetadataPayload(key, base64ToBytes(b64));
          } catch (err) {
            decryptFailures += 1;
            throw err;
          }
        },
        state.lastAppliedVersion,
        state,
      );
      state = next;
      await writeCachedState(input.userId, input.workspaceId, state);
      const lastVersion = page.events[page.events.length - 1]?.version ?? cursor;
      if (lastVersion <= cursor) {
        break;
      }
      cursor = lastVersion;
    }
    // replayWorkspaceFolderEvents swallows per-event decrypt errors. If every
    // ciphertext failed, surface a hard error so hosts do not render a false
    // "no folders" empty state (extension popup previously looked healthy).
    if (
      decryptAttempts > 0 &&
      decryptFailures >= decryptAttempts &&
      state.folders.size === 0
    ) {
      throw new Error(
        `FOLDER_METADATA_DECRYPT_FAILED attempts=${decryptAttempts} failures=${decryptFailures} events=${eventsFetched}`,
      );
    }
    return { eventsFetched, decryptAttempts, decryptFailures };
  }

  /**
   * Probe personal-event ciphertext against the current metadata key.
   *
   * After master-password restore without folder migration, the stream can be a
   * mix of old-C and new-C envelopes (e.g. real folders under old C + a later
   * `extension-repair-probe` under current C). "Any recent event decrypts" is
   * NOT enough — we must detect undecryptable FOLDER_* events and whether local
   * materialized folder ids are missing from the decryptable stream set.
   */
  async function probeCurrentKeyAgainstStream(): Promise<{
    decrypts: boolean;
    tipVersion: number;
    folderDecryptOk: number;
    folderDecryptFail: number;
    decryptableFolderIds: Set<string>;
  }> {
    const page = await input.core.listWorkspacePersonalEvents(input.workspaceId, 0);
    if (!page.events.length) {
      return {
        decrypts: true,
        tipVersion: 0,
        folderDecryptOk: 0,
        folderDecryptFail: 0,
        decryptableFolderIds: new Set(),
      };
    }
    const tipVersion = page.events[page.events.length - 1]?.version ?? 0;
    const key = await ensureMetadataKey();
    let folderDecryptOk = 0;
    let folderDecryptFail = 0;
    let anyDecrypts = false;
    const decryptableFolderIds = new Set<string>();

    for (const ev of page.events) {
      const payload = ev.encryptedBlob?.payload;
      if (!payload) {
        continue;
      }
      const isFolderEvent = FOLDER_EVENT_TYPES.has(ev.eventType);
      try {
        const plaintext = await decryptPersonalVaultMetadataPayload(key, base64ToBytes(payload));
        anyDecrypts = true;
        if (!isFolderEvent) {
          continue;
        }
        folderDecryptOk += 1;
        const row = parseFolderPlaintextV2Utf8(plaintext);
        if (!row || row.workspaceId !== input.workspaceId) {
          continue;
        }
        if (ev.eventType === "FOLDER_DELETE" || row.deleted) {
          decryptableFolderIds.delete(row.folderId);
        } else {
          decryptableFolderIds.add(row.folderId);
        }
      } catch {
        if (isFolderEvent) {
          folderDecryptFail += 1;
        }
      }
    }
    return {
      decrypts: anyDecrypts,
      tipVersion,
      folderDecryptOk,
      folderDecryptFail,
      decryptableFolderIds,
    };
  }

  /**
   * Append one personal event. Prefer a known tip so we do not POST a stale
   * baseVersion (browser DevTools 409). On VERSION_MISMATCH: if a peer already
   * resealed under the current key, abort; otherwise rebase onto latestVersion
   * and retry (same ciphertext / idempotencyKey).
   */
  async function appendResealEvent(
    buildRequest: (baseVersion: number) => Promise<SyncAppendEventRequestDto>,
    startVersion: number,
  ): Promise<{ kind: "appended"; version: number } | { kind: "peer_resealed"; tipVersion: number }> {
    let baseVersion = startVersion;
    let request = await buildRequest(baseVersion);
    for (let attempt = 0; attempt < RESEAL_APPEND_MAX_ATTEMPTS; attempt += 1) {
      try {
        const appended = await input.core.appendWorkspacePersonalEvent(input.workspaceId, request);
        return { kind: "appended", version: appended.version };
      } catch (err) {
        const mismatch = parsePersonalEventsVersionMismatch(err);
        if (!mismatch) {
          throw err;
        }
        const probe = await probeCurrentKeyAgainstStream();
        // Peer resealed when undecryptable FOLDER_* events are gone and local
        // folder ids (if any) are covered by the decryptable set.
        const localMissing = [...state.folders.keys()].some(
          (id) => !probe.decryptableFolderIds.has(id),
        );
        if (probe.folderDecryptFail === 0 && !localMissing && probe.decrypts) {
          return { kind: "peer_resealed", tipVersion: probe.tipVersion };
        }
        baseVersion = mismatch.latestVersion;
        request = { ...request, baseVersion };
      }
    }
    throw new Error("RESEAL_VERSION_CONFLICT");
  }

  /**
   * Re-append current materialized folder / assignment / favorite state under
   * the current passwordShareC-derived metadata key. Used after recovery
   * restore (no old C) or when the stream key drifted from local cache.
   *
   * `serverTipVersion` must be the current MAX(version) on the server — local
   * `lastAppliedVersion` often lags when undecryptable events were skipped.
   */
  async function resealMaterializedStateUnderCurrentKey(serverTipVersion: number): Promise<void> {
    if (state.folders.size === 0 && state.itemFolder.size === 0 && state.itemFavorite.size === 0) {
      return;
    }
    const key = await ensureMetadataKey();
    const resealOrigin = Math.max(serverTipVersion, state.lastAppliedVersion);
    let version = resealOrigin;
    let abortedForPeer = false;
    const folders = [...state.folders.values()]
      .filter((folder) => folder.name !== AGENT_REPAIR_PROBE_FOLDER_NAME)
      .sort((a, b) => {
      const aDepth = a.parentFolderId ? 1 : 0;
      const bDepth = b.parentFolderId ? 1 : 0;
      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.folderId.localeCompare(b.folderId);
    });

    const runAppend = async (
      buildRequest: (baseVersion: number) => Promise<SyncAppendEventRequestDto>,
    ): Promise<boolean> => {
      const result = await appendResealEvent(buildRequest, version);
      if (result.kind === "peer_resealed") {
        // Peer wrote under the current key — replay their events from origin.
        state = {
          ...state,
          lastAppliedVersion: resealOrigin,
        };
        abortedForPeer = true;
        return false;
      }
      version = result.version;
      return true;
    };

    for (const folder of folders) {
      const idempotencyKey = generateEntityId();
      const ok = await runAppend((baseVersion) =>
        buildFolderCreateAppendRequest(key, folder, baseVersion, idempotencyKey),
      );
      if (!ok) {
        break;
      }
    }
    if (!abortedForPeer) {
      for (const [itemId, folderId] of state.itemFolder.entries()) {
        const idempotencyKey = generateEntityId();
        const ok = await runAppend((baseVersion) =>
          buildItemFolderAssignAppendRequest(
            key,
            {
              schemaVersion: 2,
              itemId,
              workspaceId: input.workspaceId,
              folderId,
            },
            baseVersion,
            idempotencyKey,
          ),
        );
        if (!ok) {
          break;
        }
      }
    }
    if (!abortedForPeer) {
      for (const itemId of state.itemFavorite) {
        const idempotencyKey = generateEntityId();
        const ok = await runAppend((baseVersion) =>
          buildItemFavoriteSetAppendRequest(
            key,
            {
              schemaVersion: 2,
              itemId,
              workspaceId: input.workspaceId,
              favorite: true,
            },
            baseVersion,
            idempotencyKey,
          ),
        );
        if (!ok) {
          break;
        }
      }
    }
    if (!abortedForPeer) {
      state = {
        ...state,
        lastAppliedVersion: version,
      };
    }
    await writeCachedState(input.userId, input.workspaceId, state);
  }

  /** Tombstone agent live-reseal probe folders left on the personal-events stream. */
  async function deleteAgentRepairProbeFolders(serverTipVersion: number): Promise<boolean> {
    const probes = [...state.folders.values()].filter(
      (folder) => folder.name === AGENT_REPAIR_PROBE_FOLDER_NAME,
    );
    if (!probes.length) {
      return false;
    }
    const key = await ensureMetadataKey();
    let version = Math.max(serverTipVersion, state.lastAppliedVersion);
    let deleted = false;
    for (const folder of probes) {
      const idempotencyKey = generateEntityId();
      const tombstone = createFolderDeleteTombstoneV2(
        folder.folderId,
        input.workspaceId,
        Date.now(),
      );
      const result = await appendResealEvent(
        (baseVersion) =>
          buildFolderDeleteAppendRequest(key, tombstone, baseVersion, idempotencyKey),
        version,
      );
      if (result.kind === "peer_resealed") {
        state = {
          ...state,
          lastAppliedVersion: result.tipVersion,
        };
        break;
      }
      version = result.version;
      state.folders.delete(folder.folderId);
      deleted = true;
    }
    if (deleted) {
      state = {
        ...state,
        lastAppliedVersion: version,
      };
      await writeCachedState(input.userId, input.workspaceId, state);
    }
    return deleted;
  }

  async function refresh(): Promise<WorkspaceFolderReplayState> {
    // API-first (same idea as vault list): IndexedDB is never the bootstrap
    // source of truth. Always rematerialize from personal-events at version 0
    // with an empty in-memory tree, then optionally write IDB as offline cache.
    // Auto-reseal / rebaseline-from-local are intentionally NOT on this path —
    // they treated local plaintext as SoT and re-polluted the server stream.
    state = {
      folders: new Map(),
      itemFolder: new Map(),
      itemFavorite: new Set(),
      lastAppliedVersion: 0,
    };

    let deletedRepairProbe = false;
    let stats = await replayIncremental(0);

    // Drop agent test probe even when it was the only decryptable folder.
    if ([...state.folders.values()].some((f) => f.name === AGENT_REPAIR_PROBE_FOLDER_NAME)) {
      deletedRepairProbe = await deleteAgentRepairProbeFolders(state.lastAppliedVersion);
      if (deletedRepairProbe) {
        // Probe DELETE advanced the tip — rematerialize again from 0 so UI
        // matches server tip after the tombstone.
        state = {
          folders: new Map(),
          itemFolder: new Map(),
          itemFavorite: new Set(),
          lastAppliedVersion: 0,
        };
        const afterProbe = await replayIncremental(0);
        stats = {
          eventsFetched: stats.eventsFetched + afterProbe.eventsFetched,
          decryptAttempts: stats.decryptAttempts + afterProbe.decryptAttempts,
          decryptFailures: stats.decryptFailures + afterProbe.decryptFailures,
        };
      }
    }

    // Diagnostics only: mixed-key streams show decrypt failures without inventing
    // folders from a local snapshot.
    const probe = await probeCurrentKeyAgainstStream();

    // Persist after successful API materialization (optional offline cache).
    await writeCachedState(input.userId, input.workspaceId, state);

    lastRefreshDiagnostics = {
      ...stats,
      fromVersion: 0,
      folderCount: state.folders.size,
      usedCache: false,
      resetPoisonedCache: false,
      resealedStaleKey: false,
      deletedRepairProbe,
      rebaselinedFromLocal: false,
      probeFolderDecryptFail: probe.folderDecryptFail,
      probeFolderDecryptOk: probe.folderDecryptOk,
      serverTipVersion: state.lastAppliedVersion,
    };
    return state;
  }

  /**
   * Explicit opt-in recovery only — NOT used by refresh()/unlock/open/switch.
   * Repairs a polluted personal-events stream using THIS origin's IndexedDB
   * plaintext. Prefer API-first rematerialize; call this only when the stream
   * itself must be rewritten from a known-good local tree.
   */
  async function rebaselineFromLocalPlaintext(): Promise<WorkspaceFolderReplayState> {
    const cached = await readCachedState(input.userId, input.workspaceId);
    const desiredFolders = new Map(
      [...(cached?.folders.entries() ?? [])].filter(
        ([, folder]) => folder.name !== AGENT_REPAIR_PROBE_FOLDER_NAME,
      ),
    );
    if (desiredFolders.size === 0) {
      throw new Error("REBASELINE_NO_LOCAL_PLAINTEXT");
    }
    const desiredItemFolder = new Map(cached?.itemFolder ?? []);
    const desiredItemFavorite = new Set(cached?.itemFavorite ?? []);
    const desiredIds = new Set(desiredFolders.keys());

    // Materialize decryptable stream folders from empty (current key only).
    state = {
      folders: new Map(),
      itemFolder: new Map(),
      itemFavorite: new Set(),
      lastAppliedVersion: 0,
    };
    const streamStats = await replayIncremental(0);
    const extras = folderIdsToTombstoneForRebaseline(state.folders.keys(), desiredIds);

    let version = await readServerTipVersion(state.lastAppliedVersion);
    const key = await ensureMetadataKey();
    for (const folderId of extras) {
      const existing = state.folders.get(folderId);
      const idempotencyKey = generateEntityId();
      const tombstone = createFolderDeleteTombstoneV2(
        folderId,
        input.workspaceId,
        existing?.updatedAtMs ?? Date.now(),
      );
      const result = await appendResealEvent(
        (baseVersion) =>
          buildFolderDeleteAppendRequest(key, tombstone, baseVersion, idempotencyKey),
        version,
      );
      if (result.kind === "peer_resealed") {
        version = result.tipVersion;
        break;
      }
      version = result.version;
      state.folders.delete(folderId);
    }

    state = {
      folders: desiredFolders,
      itemFolder: desiredItemFolder,
      itemFavorite: desiredItemFavorite,
      lastAppliedVersion: version,
    };
    await writeCachedState(input.userId, input.workspaceId, state);
    await resealMaterializedStateUnderCurrentKey(version);
    const afterStats = await replayIncremental(state.lastAppliedVersion);

    // Keep desired plaintext even if residual undecryptable history exists.
    state = {
      folders: desiredFolders,
      itemFolder: desiredItemFolder,
      itemFavorite: desiredItemFavorite,
      lastAppliedVersion: Math.max(state.lastAppliedVersion, version),
    };
    await writeCachedState(input.userId, input.workspaceId, state);

    lastRefreshDiagnostics = {
      eventsFetched: streamStats.eventsFetched + afterStats.eventsFetched,
      decryptAttempts: streamStats.decryptAttempts + afterStats.decryptAttempts,
      decryptFailures: streamStats.decryptFailures + afterStats.decryptFailures,
      fromVersion: 0,
      folderCount: state.folders.size,
      usedCache: true,
      resetPoisonedCache: false,
      resealedStaleKey: true,
      deletedRepairProbe: false,
      rebaselinedFromLocal: true,
      probeFolderDecryptFail: 0,
      probeFolderDecryptOk: 0,
      serverTipVersion: state.lastAppliedVersion,
    };
    return state;
  }

  async function enqueue(request: SyncAppendEventRequestDto): Promise<void> {
    await replayIncremental(state.lastAppliedVersion);
    // Append baseVersion must match server tip; lastAppliedVersion can lag when
    // undecryptable events were skipped (outbox would 409+retry and spam DevTools).
    request.baseVersion = await readServerTipVersion(state.lastAppliedVersion);
    await outbox.enqueue({
      workspaceId: input.workspaceId,
      request,
    });
    await outbox.drain(input.workspaceId);
    await replayIncremental(state.lastAppliedVersion);
  }

  async function readServerTipVersion(afterVersion: number): Promise<number> {
    let tip = afterVersion;
    let cursor = afterVersion;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await input.core.listWorkspacePersonalEvents(input.workspaceId, cursor);
      if (!page.events.length) {
        break;
      }
      tip = page.events[page.events.length - 1]?.version ?? tip;
      if (tip <= cursor) {
        break;
      }
      cursor = tip;
    }
    return tip;
  }

  async function applyMutations(mutations: FolderTreeMutation[]): Promise<void> {
    const key = await ensureMetadataKey();
    await replayIncremental(state.lastAppliedVersion);
    let version = await readServerTipVersion(state.lastAppliedVersion);
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
    getLastRefreshDiagnostics: () => lastRefreshDiagnostics,
    toFolderTree: () => rowsToWorkspaceTree(state.folders),
    refresh,
    rebaselineFromLocalPlaintext,
    drainOutbox: async () => {
      await outbox.drain(input.workspaceId);
      await replayIncremental(state.lastAppliedVersion);
    },
    createFolder: async (label: string, parentFolderId: string | null = null) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return "";
      }
      const key = await ensureMetadataKey();
      const nowMs = Date.now();
      const id = generateEntityId();
      const resolvedParentId = parentFolderId?.trim() ? parentFolderId : null;
      if (resolvedParentId && !state.folders.has(resolvedParentId)) {
        throw new Error("Parent folder not found");
      }
      const siblingCount = [...state.folders.values()].filter(
        (folder) => folder.parentFolderId === resolvedParentId,
      ).length;
      const folder: FolderPlaintextV2 = {
        schemaVersion: 2,
        folderId: id,
        workspaceId: input.workspaceId,
        name: trimmed,
        parentFolderId: resolvedParentId,
        sortOrder: siblingCount,
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
      await applyMutations(mutations);
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
    setItemFavorite: async (itemId, favorite) => {
      const currentlyFavorite = state.itemFavorite.has(itemId);
      if (currentlyFavorite === favorite) {
        return;
      }
      const key = await ensureMetadataKey();
      const request = await buildItemFavoriteSetAppendRequest(
        key,
        {
          schemaVersion: 2,
          itemId,
          workspaceId: input.workspaceId,
          favorite,
        },
        state.lastAppliedVersion,
      );
      await enqueue(request);
    },
    setItemsFavorite: async (itemIds, favorite) => {
      const uniqueIds = [...new Set(itemIds)].filter((itemId) => state.itemFavorite.has(itemId) !== favorite);
      if (!uniqueIds.length) {
        return;
      }
      const key = await ensureMetadataKey();
      await replayIncremental(state.lastAppliedVersion);
      let version = await readServerTipVersion(state.lastAppliedVersion);
      for (const itemId of uniqueIds) {
        const request = await buildItemFavoriteSetAppendRequest(
          key,
          {
            schemaVersion: 2,
            itemId,
            workspaceId: input.workspaceId,
            favorite,
          },
          version,
        );
        await outbox.enqueue({ workspaceId: input.workspaceId, request });
        version += 1;
      }
      await outbox.drain(input.workspaceId);
      await replayIncremental(state.lastAppliedVersion);
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

/**
 * Best-effort API-first rematerialize of personal folders for many workspaces.
 * Each workspace pulls personal-events from version 0 (same as refresh on open /
 * switch). Does not reseal from local plaintext.
 */
export async function refreshWorkspaceFoldersCachesForIds(input: {
  core: CoreClient;
  userId: string;
  passwordShareC: Uint8Array;
  workspaceIds: readonly string[];
}): Promise<void> {
  for (const workspaceId of input.workspaceIds) {
    const id = workspaceId.trim();
    if (!id) {
      continue;
    }
    const controller = createWorkspaceFoldersSyncController({
      core: input.core,
      userId: input.userId,
      workspaceId: id,
      passwordShareC: input.passwordShareC,
    });
    try {
      await controller.refresh();
    } catch (err) {
      console.warn("[okkey] workspace folder cache refresh failed", {
        workspaceId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      controller.dispose();
    }
  }
}

/**
 * Explicit recovery for a polluted personal-events folder stream: rebaseline one
 * workspace from this origin's IndexedDB plaintext (tombstone extras + reseal).
 * Opt-in only — not part of unlock/open/switch. Prefer API-first refresh.
 */
export async function rebaselineWorkspaceFoldersFromLocalCache(input: {
  core: CoreClient;
  userId: string;
  workspaceId: string;
  passwordShareC: Uint8Array;
}): Promise<WorkspaceFolderReplayState> {
  const controller = createWorkspaceFoldersSyncController({
    core: input.core,
    userId: input.userId,
    workspaceId: input.workspaceId,
    passwordShareC: input.passwordShareC,
  });
  try {
    return await controller.rebaselineFromLocalPlaintext();
  } finally {
    controller.dispose();
  }
}
