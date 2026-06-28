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
import { itemPlaintextToListRecord } from "./itemPlaintextToListRecord";
import {
  createWorkspaceVaultItemsSyncController,
  type WorkspaceVaultItemsSyncController,
} from "./workspaceVaultItemsSync";

export type WorkspaceItemsContextValue = {
  records: ItemsListRecord[];
  loading: boolean;
  bootstrapped: boolean;
  error: string | null;
  syncVersion: number;
  createItem: (item: ItemPlaintextV2) => Promise<string>;
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
}): WorkspaceItemsContextValue {
  const { userId, workspaceId, core, vaults, vaultsListReady, vaultKey, vaultUnlocked, itemFolderByItemId } =
    input;
  const [records, setRecords] = useState<ItemsListRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const controllerRef = useRef<WorkspaceVaultItemsSyncController | null>(null);
  const itemFolderRef = useRef(itemFolderByItemId);
  itemFolderRef.current = itemFolderByItemId;

  const syncFromController = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      setRecords([]);
      return;
    }
    const items = controller.getAllItems();
    setRecords(
      items.map((item) =>
        itemPlaintextToListRecord(item, {
          folderId: itemFolderRef.current.get(item.itemId) ?? null,
        }),
      ),
    );
    setSyncVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setRecords([]);
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
  }, [itemFolderByItemId, syncFromController]);

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

  const refreshItems = useCallback(async () => {
    await runMutation(async (controller) => {
      await controller.refresh();
    });
  }, [runMutation]);

  return useMemo(
    () => ({
      records,
      loading,
      bootstrapped,
      error,
      syncVersion,
      createItem,
      refreshItems,
    }),
    [records, loading, bootstrapped, error, syncVersion, createItem, refreshItems],
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
