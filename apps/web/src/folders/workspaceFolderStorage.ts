import { defaultWorkspaceFolderTree, type WorkspaceFolderNode } from "./workspaceFolderTree";

const storagePrefix = "okkey.workspace-folders.v1";

function storageKey(userId: string, workspaceId: string): string {
  return `${storagePrefix}.u.${userId}.w.${workspaceId}`;
}

function isWorkspaceFolderNode(value: unknown): value is WorkspaceFolderNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const node = value as WorkspaceFolderNode;
  if (typeof node.id !== "string" || typeof node.label !== "string") {
    return false;
  }
  if (node.children === undefined) {
    return true;
  }
  return Array.isArray(node.children) && node.children.every(isWorkspaceFolderNode);
}

export function readWorkspaceFolderTree(userId: string, workspaceId: string): WorkspaceFolderNode[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, workspaceId));
    if (!raw) {
      return defaultWorkspaceFolderTree();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isWorkspaceFolderNode)) {
      return defaultWorkspaceFolderTree();
    }
    return parsed;
  } catch {
    return defaultWorkspaceFolderTree();
  }
}

export function writeWorkspaceFolderTree(
  userId: string,
  workspaceId: string,
  tree: readonly WorkspaceFolderNode[],
): void {
  try {
    localStorage.setItem(storageKey(userId, workspaceId), JSON.stringify(tree));
  } catch {
    /* ignore quota / private mode */
  }
}
