import type { CoreClient } from "@okkey/api";
import { decryptVaultItemPayload } from "@okkey/crypto";
import {
  IndexedDbOutboxStore,
  SyncOutboxClient,
  applyItemPlaintextToReplayMap,
} from "@okkey/sync";
import {
  buildItemSyncMetadataFromPlaintext,
  buildItemUpdateAppendRequest,
} from "@okkey/sync/item-sync";
import type { ItemPlaintextV2, SyncAppendEventRequestDto, SyncEventWireDto, Vault } from "@okkey/types";
import { generateEntityId, parseAndNormalizeItemPlaintextUtf8 } from "@okkey/types";

import { base64ToBytes } from "./base64.js";
import { resolveVaultItemEncryptionKey } from "./resolve-vault-item-key.js";

const CACHE_DB = "okkey-workspace-vault-items-sync";
const CACHE_STORE = "materialized_state";
const ITEM_EVENT_TYPES = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);
const SUPPORTED_PAYLOAD_SCHEMA_VERSIONS = new Set([1, 2]);

type VaultItemsMaterializedState = {
  items: Map<string, ItemPlaintextV2>;
  /** First ITEM_CREATE actorId per item (for profile `own` scope). */
  itemCreatedByUserId: Map<string, string | null>;
  lastAppliedVersion: number;
};

type CachedWorkspaceVaultItemsState = {
  key: string;
  vaults: Array<
    [
      string,
      {
        items: Array<[string, ItemPlaintextV2]>;
        itemCreatedByUserId?: Array<[string, string | null]>;
        lastAppliedVersion: number;
      },
    ]
  >;
};

function cacheKey(userId: string, workspaceId: string): string {
  return `okkey.workspace-vault-items.v4.u.${userId}.w.${workspaceId}`;
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
): Promise<Map<string, VaultItemsMaterializedState> | null> {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(CACHE_STORE, "readonly");
    const store = tx.objectStore(CACHE_STORE);
    const req = store.get(cacheKey(userId, workspaceId));
    const row = await new Promise<CachedWorkspaceVaultItemsState | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as CachedWorkspaceVaultItemsState | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row) {
      return null;
    }
    const vaults = new Map<string, VaultItemsMaterializedState>();
    for (const [vaultId, snapshot] of row.vaults) {
      vaults.set(vaultId, {
        items: new Map(snapshot.items),
        itemCreatedByUserId: new Map(snapshot.itemCreatedByUserId ?? []),
        lastAppliedVersion: snapshot.lastAppliedVersion,
      });
    }
    return vaults;
  } catch {
    return null;
  }
}

async function writeCachedState(
  userId: string,
  workspaceId: string,
  vaults: Map<string, VaultItemsMaterializedState>,
): Promise<void> {
  try {
    const db = await openCacheDb();
    const tx = db.transaction(CACHE_STORE, "readwrite");
    const store = tx.objectStore(CACHE_STORE);
    store.put({
      key: cacheKey(userId, workspaceId),
      vaults: [...vaults.entries()].map(([vaultId, snapshot]) => [
        vaultId,
        {
          items: [...snapshot.items.entries()],
          itemCreatedByUserId: [...snapshot.itemCreatedByUserId.entries()],
          lastAppliedVersion: snapshot.lastAppliedVersion,
        },
      ]),
    } satisfies CachedWorkspaceVaultItemsState);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // cache is best-effort
  }
}

function emptyVaultState(): VaultItemsMaterializedState {
  return { items: new Map(), itemCreatedByUserId: new Map(), lastAppliedVersion: 0 };
}

function getEventBlob(event: SyncEventWireDto): { crypto_version: number; payload: string } {
  const maybe = event as SyncEventWireDto & {
    encryptedBlob?: { crypto_version?: number; payload?: string };
    payloadSchemaVersion?: number;
    encryptedPayload?: string;
  };
  if (maybe.encryptedBlob?.payload) {
    return {
      crypto_version: maybe.encryptedBlob.crypto_version ?? 2,
      payload: maybe.encryptedBlob.payload,
    };
  }
  return {
    crypto_version: maybe.payloadSchemaVersion ?? 2,
    payload: maybe.encryptedPayload ?? "",
  };
}

async function applyVaultItemEvents(
  state: VaultItemsMaterializedState,
  events: SyncEventWireDto[],
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
): Promise<VaultItemsMaterializedState> {
  const items = new Map(state.items);
  const itemCreatedByUserId = new Map(state.itemCreatedByUserId);
  let lastAppliedVersion = state.lastAppliedVersion;

  for (const event of events) {
    if (event.version <= lastAppliedVersion) {
      continue;
    }

    if (!ITEM_EVENT_TYPES.has(event.eventType)) {
      lastAppliedVersion = event.version;
      continue;
    }

    const blob = getEventBlob(event);
    if (!SUPPORTED_PAYLOAD_SCHEMA_VERSIONS.has(blob.crypto_version) || !blob.payload) {
      lastAppliedVersion = event.version;
      continue;
    }

    let plaintextBytes: Uint8Array;
    try {
      plaintextBytes = await decryptWirePayload(blob.payload);
    } catch {
      lastAppliedVersion = event.version;
      continue;
    }
    const parsed = parseAndNormalizeItemPlaintextUtf8(plaintextBytes);
    if (!parsed) {
      lastAppliedVersion = event.version;
      continue;
    }

    if (event.eventType === "ITEM_CREATE" && !itemCreatedByUserId.has(parsed.itemId)) {
      itemCreatedByUserId.set(parsed.itemId, event.actorId);
    }

    applyItemPlaintextToReplayMap(items, parsed, event);
    lastAppliedVersion = event.version;
  }

  return { items, itemCreatedByUserId, lastAppliedVersion };
}

export type WorkspaceVaultItemsReadController = {
  refresh: () => Promise<void>;
  getAllItems: () => ItemPlaintextV2[];
  getItemsByVault: (vaultId: string) => ItemPlaintextV2[];
  getItemById: (itemId: string) => ItemPlaintextV2 | null;
  getItemCreatedByUserId: (itemId: string) => string | null | undefined;
  /** Soft-delete / archive / field updates via ITEM_UPDATE append. */
  updateItem: (item: ItemPlaintextV2) => Promise<string>;
  dispose: () => void;
};

/** Vault items sync (event log replay + IndexedDB cache) with update mutations for E3+. */
export function createWorkspaceVaultItemsReadController(input: {
  core: CoreClient;
  userId: string;
  workspaceId: string;
  vaults: readonly Vault[];
  accountVaultKey: Uint8Array;
  encryptedPrivateKeyPayload?: string;
}): WorkspaceVaultItemsReadController {
  let vaultStates = new Map<string, VaultItemsMaterializedState>();
  const vaultKeyCache = new Map<string, Uint8Array>();

  const outbox = new SyncOutboxClient(
    new IndexedDbOutboxStore({
      dbName: `okkey-ws-vault-items-outbox.u.${input.userId}.w.${input.workspaceId}`,
    }),
    {
      appendVaultEvent: (vaultId, body) => input.core.appendVaultEvent(vaultId, body),
      listVaultEvents: (vaultId, afterVersion) => input.core.listVaultEvents(vaultId, afterVersion),
    },
  );

  function ensureVaultState(vaultId: string): VaultItemsMaterializedState {
    const existing = vaultStates.get(vaultId);
    if (existing) {
      return existing;
    }
    const created = emptyVaultState();
    vaultStates.set(vaultId, created);
    return created;
  }

  async function resolveVaultKey(vaultId: string): Promise<Uint8Array> {
    const cached = vaultKeyCache.get(vaultId);
    if (cached) {
      return cached;
    }
    const vault = input.vaults.find((candidate) => candidate.id === vaultId);
    if (!vault) {
      throw new Error("VAULT_NOT_FOUND");
    }
    const key = await resolveVaultItemEncryptionKey({
      vault,
      accountVaultKey: input.accountVaultKey,
      core: input.core,
      encryptedPrivateKeyPayload: input.encryptedPrivateKeyPayload,
    });
    vaultKeyCache.set(vaultId, key);
    return key;
  }

  async function replayVaultIncremental(vaultId: string): Promise<void> {
    let state = ensureVaultState(vaultId);
    const vaultKey = await resolveVaultKey(vaultId);
    const decryptWirePayload = async (encryptedPayloadBase64: string) =>
      decryptVaultItemPayload(vaultKey, base64ToBytes(encryptedPayloadBase64));

    while (true) {
      const page = await input.core.listVaultEvents(vaultId, state.lastAppliedVersion);
      if (!page.events.length) {
        break;
      }
      state = await applyVaultItemEvents(state, page.events, decryptWirePayload);
      vaultStates.set(vaultId, state);
    }
  }

  async function refresh(): Promise<void> {
    const cached = await readCachedState(input.userId, input.workspaceId);
    if (cached) {
      vaultStates = cached;
    }
    const failures: string[] = [];
    for (const vault of input.vaults) {
      try {
        await replayVaultIncremental(vault.id);
      } catch {
        failures.push(vault.id);
      }
    }
    await writeCachedState(input.userId, input.workspaceId, vaultStates);
    if (failures.length > 0 && failures.length === input.vaults.length) {
      throw new Error("VAULT_ITEMS_SYNC_FAILED");
    }
  }

  async function enqueue(request: SyncAppendEventRequestDto, vaultId: string): Promise<void> {
    await outbox.enqueue({ vaultId, request });
    await outbox.drain(vaultId);
    await replayVaultIncremental(vaultId);
    await writeCachedState(input.userId, input.workspaceId, vaultStates);
  }

  return {
    refresh,
    getAllItems: () => [...vaultStates.values()].flatMap((state) => [...state.items.values()]),
    getItemsByVault: (vaultId) => [...(vaultStates.get(vaultId)?.items.values() ?? [])],
    getItemById: (itemId) => {
      for (const state of vaultStates.values()) {
        const item = state.items.get(itemId);
        if (item) {
          return item;
        }
      }
      return null;
    },
    getItemCreatedByUserId: (itemId) => {
      for (const state of vaultStates.values()) {
        if (state.itemCreatedByUserId.has(itemId)) {
          return state.itemCreatedByUserId.get(itemId);
        }
      }
      return undefined;
    },
    updateItem: async (item) => {
      const state = ensureVaultState(item.vaultId);
      const vaultKey = await resolveVaultKey(item.vaultId);
      const request = buildItemSyncMetadataFromPlaintext(
        await buildItemUpdateAppendRequest(
          vaultKey,
          item,
          state.lastAppliedVersion,
          generateEntityId(),
        ),
        item,
      );
      await enqueue(request, item.vaultId);
      return item.itemId;
    },
    dispose: () => {
      vaultKeyCache.clear();
    },
  };
}
