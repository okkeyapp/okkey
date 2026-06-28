import type { CoreClient } from "@okkey/api";
import { decryptVaultItemPayload } from "@okkey/crypto";
import type { ItemPlaintextV2, SyncAppendEventRequestDto, Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import {
  IndexedDbOutboxStore,
  replayItemPlaintextEvents,
  SyncOutboxClient,
  type ItemVaultReplayState,
} from "@okkey/sync";
import { buildItemCreateAppendRequest } from "@okkey/sync/item-sync";

import { base64ToBytes } from "../auth/base64";
import { resolveVaultItemEncryptionKey } from "./resolveVaultItemEncryptionKey";

const CACHE_DB = "okkey-workspace-vault-items-sync";
const CACHE_STORE = "materialized_state";

type VaultItemsMaterializedState = {
  items: Map<string, ItemPlaintextV2>;
  lastAppliedVersion: number;
};

type CachedWorkspaceVaultItemsState = {
  key: string;
  vaults: Array<[string, { items: Array<[string, ItemPlaintextV2]>; lastAppliedVersion: number }]>;
};

function cacheKey(userId: string, workspaceId: string): string {
  return `okkey.workspace-vault-items.v1.u.${userId}.w.${workspaceId}`;
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
  return { items: new Map(), lastAppliedVersion: 0 };
}

export type WorkspaceVaultItemsSyncController = {
  refresh: () => Promise<void>;
  drainOutbox: () => Promise<void>;
  createItem: (item: ItemPlaintextV2) => Promise<string>;
  getItemsByVault: (vaultId: string) => ItemPlaintextV2[];
  getAllItems: () => ItemPlaintextV2[];
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
    const state = ensureVaultState(vaultId);
    const page = await input.core.listVaultEvents(vaultId, state.lastAppliedVersion);
    if (!page.events.length) {
      return;
    }
    const vaultKey = await resolveVaultKey(vaultId);
    const replayed = await replayItemPlaintextEvents(page.events, async (payloadBase64) =>
      decryptVaultItemPayload(vaultKey, base64ToBytes(payloadBase64)),
    );
    const mergedItems = new Map(state.items);
    for (const [itemId, item] of replayed.items) {
      mergedItems.set(itemId, item);
    }
    const lastVersion = page.events[page.events.length - 1]?.version ?? state.lastAppliedVersion;
    vaultStates.set(vaultId, {
      items: mergedItems,
      lastAppliedVersion: lastVersion,
    });
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
    dispose: () => {
      vaultKeyCache.clear();
    },
  };
}

export type { ItemVaultReplayState };
