import { generateEntityId } from "@okkey/types";

import type { WorkspaceFolderNode } from "./workspaceFolderTree";

export type FolderSettingsRow = {
  node: WorkspaceFolderNode;
  depth: number;
};

export function cloneWorkspaceFolderTree(nodes: readonly WorkspaceFolderNode[]): WorkspaceFolderNode[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    ...(node.children?.length ? { children: cloneWorkspaceFolderTree(node.children) } : {}),
  }));
}

function findFolderLocation(
  nodes: WorkspaceFolderNode[],
  id: string,
  parentList: WorkspaceFolderNode[] = nodes,
): { siblings: WorkspaceFolderNode[]; index: number } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.id === id) {
      return { siblings: parentList, index };
    }
    if (node.children?.length) {
      const nested = findFolderLocation(node.children, id, node.children);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function collectDescendantIds(node: WorkspaceFolderNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children ?? []) {
    for (const id of collectDescendantIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}

export function flattenWorkspaceFolderSettingsRows(
  nodes: readonly WorkspaceFolderNode[],
  depth = 0,
): FolderSettingsRow[] {
  return nodes.flatMap((node) => {
    const self: FolderSettingsRow = { node, depth };
    const nested = node.children?.length ? flattenWorkspaceFolderSettingsRows(node.children, depth + 1) : [];
    return [self, ...nested];
  });
}

export function removeWorkspaceFolderById(tree: WorkspaceFolderNode[], id: string): WorkspaceFolderNode[] {
  const clone = cloneWorkspaceFolderTree(tree);
  const location = findFolderLocation(clone, id);
  if (!location) {
    return clone;
  }
  location.siblings.splice(location.index, 1);
  return clone;
}

export function updateWorkspaceFolderLabel(
  tree: WorkspaceFolderNode[],
  id: string,
  label: string,
): WorkspaceFolderNode[] {
  const clone = cloneWorkspaceFolderTree(tree);
  function walk(nodes: WorkspaceFolderNode[]): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        node.label = label;
        return true;
      }
      if (node.children?.length && walk(node.children)) {
        return true;
      }
    }
    return false;
  }
  walk(clone);
  return clone;
}

export function createDraftWorkspaceFolderAtRoot(
  tree: readonly WorkspaceFolderNode[],
): { tree: WorkspaceFolderNode[]; id: string } {
  const id = generateEntityId();
  return {
    tree: [...cloneWorkspaceFolderTree(tree), { id, label: "" }],
    id,
  };
}

export function moveWorkspaceFolderBlock(
  tree: WorkspaceFolderNode[],
  activeId: string,
  overId: string,
  nestInside: boolean,
): WorkspaceFolderNode[] {
  if (activeId === overId) {
    return tree;
  }

  const clone = cloneWorkspaceFolderTree(tree);
  const activeLocation = findFolderLocation(clone, activeId);
  if (!activeLocation) {
    return tree;
  }

  const [removed] = activeLocation.siblings.splice(activeLocation.index, 1);
  if (!removed) {
    return tree;
  }

  const overLocation = findFolderLocation(clone, overId);
  if (!overLocation) {
    return tree;
  }

  const descendants = collectDescendantIds(removed);
  if (descendants.has(overId)) {
    return tree;
  }

  if (nestInside) {
    const overNode = overLocation.siblings[overLocation.index];
    if (!overNode) {
      return tree;
    }
    overNode.children = [...(overNode.children ?? []), removed];
    return clone;
  }

  const insertIndex =
    activeLocation.siblings === overLocation.siblings && activeLocation.index < overLocation.index
      ? overLocation.index
      : overLocation.index + 1;
  overLocation.siblings.splice(insertIndex, 0, removed);
  return clone;
}

export function buildCommittedLabelMap(tree: readonly WorkspaceFolderNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of flattenWorkspaceFolderSettingsRows(tree)) {
    const trimmed = row.node.label.trim();
    if (trimmed) {
      map.set(row.node.id, trimmed);
    }
  }
  return map;
}
