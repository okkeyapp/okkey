import type { OkkeySidebarFolderTreeNode } from "@okkey/ui";
import { generateEntityId } from "@okkey/types";

export type WorkspaceFolderNode = {
  id: string;
  label: string;
  children?: WorkspaceFolderNode[];
};

export type FlatWorkspaceFolder = {
  id: string;
  label: string;
  path: string;
};

export const NO_FOLDER_VALUE = "__none__";

export function flattenWorkspaceFolders(
  nodes: readonly WorkspaceFolderNode[],
  parentPath = "",
): FlatWorkspaceFolder[] {
  return nodes.flatMap((node) => {
    const path = parentPath ? `${parentPath} / ${node.label}` : node.label;
    const self: FlatWorkspaceFolder = { id: node.id, label: node.label, path };
    const nested = node.children?.length ? flattenWorkspaceFolders(node.children, path) : [];
    return [self, ...nested];
  });
}

export function workspaceFolderIdExists(
  nodes: readonly WorkspaceFolderNode[],
  folderId: string,
): boolean {
  for (const node of nodes) {
    if (node.id === folderId) {
      return true;
    }
    if (node.children?.length && workspaceFolderIdExists(node.children, folderId)) {
      return true;
    }
  }
  return false;
}

export function folderPathExists(folders: readonly FlatWorkspaceFolder[], query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return folders.some(
    (folder) =>
      folder.path.toLowerCase() === normalized || folder.label.toLowerCase() === normalized,
  );
}

export function createWorkspaceFolderAtRoot(
  tree: readonly WorkspaceFolderNode[],
  label: string,
): { tree: WorkspaceFolderNode[]; id: string } {
  const trimmed = label.trim();
  const id = generateEntityId();
  return {
    tree: [...tree, { id, label: trimmed }],
    id,
  };
}

export function toSidebarFolderTree(
  nodes: readonly WorkspaceFolderNode[],
  toPath: (folderId: string) => string,
  activeFolderId: string,
): OkkeySidebarFolderTreeNode[] {
  return nodes.map((node) => {
    const children = node.children?.length
      ? toSidebarFolderTree(node.children, toPath, activeFolderId)
      : undefined;
    return {
      id: node.id,
      label: node.label,
      to: toPath(node.id),
      isActive: activeFolderId === node.id,
      ...(children ? { children } : {}),
    };
  });
}
