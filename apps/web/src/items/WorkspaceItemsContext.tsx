import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CoreClient } from "@okkey/api";
import type { ItemPlaintextV2, Vault } from "@okkey/types";

import type { ItemsListRecord } from "../components/workspace/ItemsListLeftPane";
import type { ItemActivityWireEntry } from "./buildItemActivityEntries";
import { itemPlaintextToListRecord } from "./itemPlaintextToListRecord";
import { withItemArchivedState } from "./itemArchive";
import { withItemDeletedState } from "./itemDelete";
import {
  createWorkspaceVaultItemsSyncController,
  type WorkspaceVaultItemsSyncController,
} from "./workspaceVaultItemsSync";

export type WorkspaceItemsContextValue = {
  records: ItemsListRecord[];
  items: ItemPlaintextV2[];
  loading: boolean;
  bootstrapped: boolean;
  error: string | null;
  syncVersion: number;
  getItemById: (itemId: string) => ItemPlaintextV2 | undefined;
  getItemActivityById: (itemId: string) => ItemActivityWireEntry[];
  createItem: (item: ItemPlaintextV2) => Promise<string>;
  updateItem: (item: ItemPlaintextV2) => Promise<string>;
  updateItemQuiet: (item: ItemPlaintextV2) => Promise<string>;
  setItemArchived: (itemId: string, archived: boolean) => Promise<void>;
  setItemsArchived: (itemIds: readonly string[], archived: boolean) => Promise<void>;
  setItemDeleted: (itemId: string, deleted: boolean) => Promise<void>;
  setItemsDeleted: (itemIds: readonly string[], deleted: boolean) => Promise<void>;
  refreshItems: () => Promise<void>;
};

const WorkspaceItemsContext = createContext<WorkspaceItemsContextValue | null>(null);

export function useWorkspaceItemsState(input: {
  userId: string;
  workspaceId: string;
  core: CoreClient | null;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
  vaultKey: Uint8Array | null;
  vaultUnlocked: boolean;
  itemFolderByItemId: ReadonlyMap<string, string | null>;
  itemFavoriteByItemId: ReadonlySet<string>;
  deletedItemsRetentionDays: number;
}): WorkspaceItemsContextValue {
  const {
    userId,
    workspaceId,
    core,
    vaults,
    vaultsListReady,
    vaultKey,
    vaultUnlocked,
    itemFolderByItemId,
    itemFavoriteByItemId,
    deletedItemsRetentionDays,
  } = input;
  const [records, setRecords] = useState<ItemsListRecord[]>([]);
  const [items, setItems] = useState<ItemPlaintextV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const controllerRef = useRef<WorkspaceVaultItemsSyncController | null>(null);
  const itemFolderRef = useRef(itemFolderByItemId);
  itemFolderRef.current = itemFolderByItemId;
  const itemFavoriteRef = useRef(itemFavoriteByItemId);
  itemFavoriteRef.current = itemFavoriteByItemId;

  const deletedRetentionRef = useRef(deletedItemsRetentionDays);
  deletedRetentionRef.current = deletedItemsRetentionDays;

  const isDeletedItemWithinRetention = useCallback((item: ItemPlaintextV2) => {
    if (!item.deleted) {
      return true;
    }
    const deletedAtMs = item.deletedAtMs ?? item.updatedAtMs;
    const retentionMs = deletedRetentionRef.current * 86_400_000;
    return Date.now() - deletedAtMs < retentionMs;
  }, []);

  const syncFromController = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      setRecords([]);
      setItems([]);
      return;
    }
    const syncedItems = controller.getAllItems().filter(isDeletedItemWithinRetention);
    setItems(syncedItems);
    setRecords(
      syncedItems.map((item) =>
        itemPlaintextToListRecord(item, {
          folderId: itemFolderRef.current.get(item.itemId) ?? null,
          favorite: itemFavoriteRef.current.has(item.itemId),
        }),
      ),
    );
    setSyncVersion((version) => version + 1);
  }, [isDeletedItemWithinRetention]);

  useEffect(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setRecords([]);
    setItems([]);
    setBootstrapped(false);
    setError(null);

    if (!userId || !workspaceId || !core || !vaultUnlocked || !vaultKey || !vaultsListReady || vaults.length === 0) {
      return;
    }

    const controller = createWorkspaceVaultItemsSyncController({
      core,
      userId,
      workspaceId,
      vaults,
      accountVaultKey: vaultKey,
    });
    controllerRef.current = controller;

    let cancelled = false;
    setLoading(true);
    void controller
      .refresh()
      .then(() => {
        if (!cancelled) {
          syncFromController();
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "item sync failed");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setBootstrapped(true);
        }
      });

    const onFocus = () => {
      void controller.refresh().then(syncFromController).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [userId, workspaceId, core, vaultKey, vaultUnlocked, vaults, vaultsListReady, syncFromController]);

  useEffect(() => {
    syncFromController();
  }, [itemFolderByItemId, itemFavoriteByItemId, syncFromController]);

  const runMutation = useCallback(
    async (fn: (controller: WorkspaceVaultItemsSyncController) => Promise<void>) => {
      const controller = controllerRef.current;
      if (!controller) {
        throw new Error("ITEMS_SYNC_NOT_READY");
      }
      setLoading(true);
      setError(null);
      try {
        await fn(controller);
        syncFromController();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "item sync failed");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [syncFromController],
  );

  const createItem = useCallback(
    async (item: ItemPlaintextV2) => {
      let createdId = "";
      await runMutation(async (controller) => {
        createdId = await controller.createItem(item);
      });
      return createdId;
    },
    [runMutation],
  );

  const updateItem = useCallback(
    async (item: ItemPlaintextV2) => {
      let updatedId = "";
      await runMutation(async (controller) => {
        updatedId = await controller.updateItem(item);
      });
      return updatedId;
    },
    [runMutation],
  );

  const updateItemQuiet = useCallback(
    async (item: ItemPlaintextV2) => {
      const controller = controllerRef.current;
      if (!controller) {
        throw new Error("ITEMS_SYNC_NOT_READY");
      }

      let updatedId = "";
      try {
        updatedId = await controller.updateItem(item);
        syncFromController();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "item sync failed");
        throw err;
      }
      return updatedId;
    },
    [syncFromController],
  );

  const setItemArchived = useCallback(
    async (itemId: string, archived: boolean) => {
      await runMutation(async (controller) => {
        const item = controller.getAllItems().find((candidate) => candidate.itemId === itemId);
        if (!item) {
          throw new Error("ITEM_NOT_FOUND");
        }
        if (Boolean(item.archived) === archived) {
          return;
        }
        if (item.deleted) {
          throw new Error("CANNOT_ARCHIVE_DELETED_ITEM");
        }
        await controller.updateItem(withItemArchivedState(item, archived));
      });
    },
    [runMutation],
  );

  const setItemsArchived = useCallback(
    async (itemIds: readonly string[], archived: boolean) => {
      const uniqueIds = [...new Set(itemIds)];
      if (!uniqueIds.length) {
        return;
      }
      await runMutation(async (controller) => {
        const itemsById = new Map(controller.getAllItems().map((item) => [item.itemId, item]));
        for (const itemId of uniqueIds) {
          const item = itemsById.get(itemId);
          if (!item || item.deleted || Boolean(item.archived) === archived) {
            continue;
          }
          await controller.updateItem(withItemArchivedState(item, archived));
        }
      });
    },
    [runMutation],
  );

  const setItemDeleted = useCallback(
    async (itemId: string, deleted: boolean) => {
      await runMutation(async (controller) => {
        const item = controller.getAllItems().find((candidate) => candidate.itemId === itemId);
        if (!item) {
          throw new Error("ITEM_NOT_FOUND");
        }
        if (Boolean(item.deleted) === deleted) {
          return;
        }
        await controller.updateItem(withItemDeletedState(item, deleted));
      });
    },
    [runMutation],
  );

  const setItemsDeleted = useCallback(
    async (itemIds: readonly string[], deleted: boolean) => {
      const uniqueIds = [...new Set(itemIds)];
      if (!uniqueIds.length) {
        return;
      }
      await runMutation(async (controller) => {
        const itemsById = new Map(controller.getAllItems().map((item) => [item.itemId, item]));
        for (const itemId of uniqueIds) {
          const item = itemsById.get(itemId);
          if (!item || Boolean(item.deleted) === deleted) {
            continue;
          }
          await controller.updateItem(withItemDeletedState(item, deleted));
        }
      });
    },
    [runMutation],
  );

  const refreshItems = useCallback(async () => {
    await runMutation(async (controller) => {
      await controller.refresh();
    });
  }, [runMutation]);

  const getItemById = useCallback(
    (itemId: string) => items.find((item) => item.itemId === itemId),
    [items],
  );

  const getItemActivityById = useCallback((itemId: string) => {
    const controller = controllerRef.current;
    if (!controller) {
      return [];
    }
    return controller.getItemActivityById(itemId);
  }, [syncVersion]);

  return useMemo(
    () => ({
      records,
      items,
      loading,
      bootstrapped,
      error,
      syncVersion,
      getItemById,
      getItemActivityById,
      createItem,
      updateItem,
      updateItemQuiet,
      setItemArchived,
      setItemsArchived,
      setItemDeleted,
      setItemsDeleted,
      refreshItems,
    }),
    [
      records,
      items,
      loading,
      bootstrapped,
      error,
      syncVersion,
      getItemById,
      getItemActivityById,
      createItem,
      updateItem,
      updateItemQuiet,
      setItemArchived,
      setItemsArchived,
      setItemDeleted,
      setItemsDeleted,
      refreshItems,
    ],
  );
}

export function WorkspaceItemsProvider({
  value,
  children,
}: {
  value: WorkspaceItemsContextValue;
  children: ReactNode;
}) {
  return <WorkspaceItemsContext.Provider value={value}>{children}</WorkspaceItemsContext.Provider>;
}

export function useWorkspaceItems(): WorkspaceItemsContextValue {
  const ctx = useContext(WorkspaceItemsContext);
  if (!ctx) {
    throw new Error("useWorkspaceItems must be used within WorkspaceItemsProvider");
  }
  return ctx;
}
