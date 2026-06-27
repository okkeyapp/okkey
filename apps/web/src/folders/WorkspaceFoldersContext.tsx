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

import {
  createWorkspaceFoldersSyncController,
  type WorkspaceFoldersSyncController,
} from "./workspaceFoldersSync";
import type { FlatWorkspaceFolder, WorkspaceFolderNode } from "./workspaceFolderTree";
import { flattenWorkspaceFolders } from "./workspaceFolderTree";

export type WorkspaceFoldersContextValue = {
  folderTree: WorkspaceFolderNode[];
  flatFolders: FlatWorkspaceFolder[];
  loading: boolean;
  error: string | null;
  syncVersion: number;
  createFolder: (label: string) => Promise<string>;
  commitFolderTree: (tree: WorkspaceFolderNode[]) => Promise<void>;
  assignItemToFolder: (itemId: string, folderId: string | null) => Promise<void>;
  refreshFolders: () => Promise<void>;
};

const WorkspaceFoldersContext = createContext<WorkspaceFoldersContextValue | null>(null);

export function useWorkspaceFoldersState(input: {
  userId: string;
  workspaceId: string;
  core: CoreClient | null;
  passwordShareC: Uint8Array | null;
  vaultUnlocked: boolean;
}): WorkspaceFoldersContextValue {
  const { userId, workspaceId, core, passwordShareC, vaultUnlocked } = input;
  const [folderTree, setFolderTree] = useState<WorkspaceFolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const controllerRef = useRef<WorkspaceFoldersSyncController | null>(null);

  const flatFolders = useMemo(() => flattenWorkspaceFolders(folderTree), [folderTree]);

  const syncFromController = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) {
      setFolderTree([]);
      return;
    }
    setFolderTree(controller.toFolderTree());
    setSyncVersion(controller.getState().lastAppliedVersion);
  }, []);

  useEffect(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setFolderTree([]);
    setError(null);

    if (!userId || !workspaceId || !core || !vaultUnlocked || !passwordShareC) {
      return;
    }

    const controller = createWorkspaceFoldersSyncController({
      core,
      userId,
      workspaceId,
      passwordShareC,
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
          setError(err instanceof Error ? err.message : "folder sync failed");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
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
  }, [userId, workspaceId, core, passwordShareC, vaultUnlocked, syncFromController]);

  const runMutation = useCallback(
    async (fn: (controller: WorkspaceFoldersSyncController) => Promise<void>) => {
      const controller = controllerRef.current;
      if (!controller) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await fn(controller);
        syncFromController();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "folder sync failed");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [syncFromController],
  );

  const createFolder = useCallback(
    async (label: string) => {
      let createdId = "";
      await runMutation(async (controller) => {
        createdId = await controller.createFolder(label);
      });
      return createdId;
    },
    [runMutation],
  );

  const commitFolderTree = useCallback(
    async (tree: WorkspaceFolderNode[]) => {
      await runMutation(async (controller) => {
        await controller.commitFolderTree(tree);
      });
    },
    [runMutation],
  );

  const assignItemToFolder = useCallback(
    async (itemId: string, folderId: string | null) => {
      await runMutation(async (controller) => {
        await controller.assignItemToFolder(itemId, folderId);
      });
    },
    [runMutation],
  );

  const refreshFolders = useCallback(async () => {
    await runMutation(async (controller) => {
      await controller.refresh();
    });
  }, [runMutation]);

  return useMemo(
    () => ({
      folderTree,
      flatFolders,
      loading,
      error,
      syncVersion,
      createFolder,
      commitFolderTree,
      assignItemToFolder,
      refreshFolders,
    }),
    [
      folderTree,
      flatFolders,
      loading,
      error,
      syncVersion,
      createFolder,
      commitFolderTree,
      assignItemToFolder,
      refreshFolders,
    ],
  );
}

export function WorkspaceFoldersProvider({
  value,
  children,
}: {
  value: WorkspaceFoldersContextValue;
  children: ReactNode;
}) {
  return <WorkspaceFoldersContext.Provider value={value}>{children}</WorkspaceFoldersContext.Provider>;
}

export function useWorkspaceFolders(): WorkspaceFoldersContextValue {
  const ctx = useContext(WorkspaceFoldersContext);
  if (!ctx) {
    throw new Error("useWorkspaceFolders must be used within WorkspaceFoldersProvider");
  }
  return ctx;
}
