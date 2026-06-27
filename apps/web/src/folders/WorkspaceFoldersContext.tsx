import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { readWorkspaceFolderTree, writeWorkspaceFolderTree } from "./workspaceFolderStorage";
import {
  createWorkspaceFolderAtRoot,
  flattenWorkspaceFolders,
  type FlatWorkspaceFolder,
  type WorkspaceFolderNode,
} from "./workspaceFolderTree";

export type WorkspaceFoldersContextValue = {
  folderTree: WorkspaceFolderNode[];
  flatFolders: FlatWorkspaceFolder[];
  createFolder: (label: string) => string;
  replaceFolderTree: (tree: WorkspaceFolderNode[]) => void;
};

const WorkspaceFoldersContext = createContext<WorkspaceFoldersContextValue | null>(null);

export function useWorkspaceFoldersState(userId: string, workspaceId: string): WorkspaceFoldersContextValue {
  const [folderTree, setFolderTree] = useState<WorkspaceFolderNode[]>(() =>
    readWorkspaceFolderTree(userId, workspaceId),
  );

  useEffect(() => {
    if (!userId || !workspaceId) {
      return;
    }
    setFolderTree(readWorkspaceFolderTree(userId, workspaceId));
  }, [userId, workspaceId]);

  const persistTree = useCallback(
    (next: WorkspaceFolderNode[]) => {
      if (!userId || !workspaceId) {
        return;
      }
      setFolderTree(next);
      writeWorkspaceFolderTree(userId, workspaceId, next);
    },
    [userId, workspaceId],
  );

  const createFolder = useCallback(
    (label: string) => {
      if (!userId || !workspaceId) {
        return "";
      }
      const { tree, id } = createWorkspaceFolderAtRoot(folderTree, label);
      persistTree(tree);
      return id;
    },
    [folderTree, persistTree],
  );

  const replaceFolderTree = useCallback(
    (next: WorkspaceFolderNode[]) => {
      persistTree(next);
    },
    [persistTree],
  );

  const flatFolders = useMemo(() => flattenWorkspaceFolders(folderTree), [folderTree]);

  return useMemo(
    () => ({
      folderTree,
      flatFolders,
      createFolder,
      replaceFolderTree,
    }),
    [folderTree, flatFolders, createFolder, replaceFolderTree],
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
