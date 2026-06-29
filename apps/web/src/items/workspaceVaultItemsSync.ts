import type { CoreClient } from "@okkey/api";
import { decryptVaultItemPayload } from "@okkey/crypto";
import type { ItemPlaintextV2, SyncAppendEventRequestDto, SyncEventWireDto, Vault } from "@okkey/types";
import { generateEntityId, parseAndNormalizeItemPlaintextUtf8 } from "@okkey/types";
import {
  IndexedDbOutboxStore,
  SyncOutboxClient,
} from "@okkey/sync";
import { buildItemCreateAppendRequest, buildItemUpdateAppendRequest } from "@okkey/sync/item-sync";

import { base64ToBytes } from "../auth/base64";
import type { ItemActivityWireEntry } from "./buildItemActivityEntries";
import { resolveItemUpdateActivityKey } from "./buildItemActivityEntries";
import { resolveVaultItemEncryptionKey } from "./resolveVaultItemEncryptionKey";

const CACHE_DB = "okkey-workspace-vault-items-sync";
const CACHE_STORE = "materialized_state";
const ITEM_EVENT_TYPES = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);
const SUPPORTED_PAYLOAD_SCHEMA_VERSIONS = new Set([1, 2]);

type VaultItemsMaterializedState = {
  items: Map<string, ItemPlaintextV2>;
  itemActivity: Map<string, ItemActivityWireEntry[]>;
  lastAppliedVersion: number;
};

type CachedWorkspaceVaultItemsState = {
  key: string;
  vaults: Array<
    [
      string,
      {
        items: Array<[string, ItemPlaintextV2]>;
        itemActivity?: Array<[string, ItemActivityWireEntry[]]>;
        lastAppliedVersion: number;
      },
    ]
  >;
};

function cacheKey(userId: string, workspaceId: string): string {
  return `okkey.workspace-vault-items.v2.u.${userId}.w.${workspaceId}`;
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
      const hasActivity = Boolean(snapshot.itemActivity);
      vaults.set(vaultId, {
        items: new Map(snapshot.items),
        itemActivity: new Map(snapshot.itemActivity ?? []),
        lastAppliedVersion: hasActivity ? snapshot.lastAppliedVersion : 0,
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
          itemActivity: [...snapshot.itemActivity.entries()],
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
  return { items: new Map(), itemActivity: new Map(), lastAppliedVersion: 0 };
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

function appendItemActivity(
  itemActivity: Map<string, ItemActivityWireEntry[]>,
  itemId: string,
  event: SyncEventWireDto,
  actionKey: ItemActivityWireEntry["actionKey"],
): void {
  const list = itemActivity.get(itemId) ?? [];
  list.push({
    id: event.id,
    actionKey,
    atMs: Date.parse(event.createdAt) || Date.now(),
    actorId: event.actorId,
  });
  itemActivity.set(itemId, list);
}

async function applyVaultItemEvents(
  state: VaultItemsMaterializedState,
  events: SyncEventWireDto[],
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
): Promise<VaultItemsMaterializedState> {
  const items = new Map(state.items);
  const itemActivity = new Map(state.itemActivity);
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

    const plaintextBytes = await decryptWirePayload(blob.payload);
    const parsed = parseAndNormalizeItemPlaintextUtf8(plaintextBytes);
    if (!parsed) {
      lastAppliedVersion = event.version;
      continue;
    }

    if (event.eventType === "ITEM_CREATE") {
      appendItemActivity(itemActivity, parsed.itemId, event, "created");
    } else if (event.eventType === "ITEM_UPDATE") {
      const previous = items.get(parsed.itemId);
      appendItemActivity(
        itemActivity,
        parsed.itemId,
        event,
        resolveItemUpdateActivityKey(previous, parsed),
      );
    }

    if (parsed.deleted || event.eventType === "ITEM_DELETE") {
      items.delete(parsed.itemId);
    } else {
      items.set(parsed.itemId, parsed);
    }

    lastAppliedVersion = event.version;
  }

  return { items, itemActivity, lastAppliedVersion };
}

export type WorkspaceVaultItemsSyncController = {
  refresh: () => Promise<void>;
  drainOutbox: () => Promise<void>;
  createItem: (item: ItemPlaintextV2) => Promise<string>;
  updateItem: (item: ItemPlaintextV2) => Promise<string>;
  getItemsByVault: (vaultId: string) => ItemPlaintextV2[];
  getAllItems: () => ItemPlaintextV2[];
  getItemActivityById: (itemId: string) => ItemActivityWireEntry[];
  getState: () => Map<string, VaultItemsMaterializedState>;
  dispose: () => void;
};

export function createWorkspaceVaultItemsSyncController(input: {
  core: CoreClient;
  userId: string;
  workspaceId: string;
  vaults: readonly Vault[];
  accountVaultKey: Uint8Array;
}): WorkspaceVaultItemsSyncController {
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
    for (const vault of input.vaults) {
      await replayVaultIncremental(vault.id);
    }
    await writeCachedState(input.userId, input.workspaceId, vaultStates);
  }

  async function enqueue(request: SyncAppendEventRequestDto, vaultId: string): Promise<void> {
    await outbox.enqueue({ vaultId, request });
    await outbox.drain(vaultId);
    await replayVaultIncremental(vaultId);
    await writeCachedState(input.userId, input.workspaceId, vaultStates);
  }

  return {
    getState: () => vaultStates,
    getItemsByVault: (vaultId) => [...(vaultStates.get(vaultId)?.items.values() ?? [])],
    getAllItems: () =>
      [...vaultStates.values()].flatMap((state) => [...state.items.values()]),
    getItemActivityById: (itemId) => {
      for (const state of vaultStates.values()) {
        const entries = state.itemActivity.get(itemId);
        if (entries?.length) {
          return entries;
        }
      }
      return [];
    },
    refresh,
    drainOutbox: async () => {
      await outbox.drain();
      await refresh();
    },
    createItem: async (item) => {
      const state = ensureVaultState(item.vaultId);
      const vaultKey = await resolveVaultKey(item.vaultId);
      const request = await buildItemCreateAppendRequest(
        vaultKey,
        item,
        state.lastAppliedVersion,
        generateEntityId(),
      );
      await enqueue(request, item.vaultId);
      return item.itemId;
    },
    updateItem: async (item) => {
      const state = ensureVaultState(item.vaultId);
      const vaultKey = await resolveVaultKey(item.vaultId);
      const request = await buildItemUpdateAppendRequest(
        vaultKey,
        item,
        state.lastAppliedVersion,
        generateEntityId(),
      );
      await enqueue(request, item.vaultId);
      return item.itemId;
    },
    dispose: () => {
      vaultKeyCache.clear();
    },
  };
}

export type { VaultItemsMaterializedState as ItemVaultReplayState };
