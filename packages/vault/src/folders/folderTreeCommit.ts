import type { FolderPlaintextV2 } from "@okkey/types";
import { createFolderDeleteTombstoneV2 } from "@okkey/types";
import { generateEntityId } from "@okkey/types";

import type { WorkspaceFolderNode } from "./workspaceFolderTree.js";

export type FolderRowSnapshot = {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
};

export function compareFolderSiblingOrder(a: FolderPlaintextV2, b: FolderPlaintextV2): number {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) {
    return order;
  }
  return a.name.localeCompare(b.name) || a.folderId.localeCompare(b.folderId);
}

export function workspaceTreeToRowMap(tree: readonly WorkspaceFolderNode[]): Map<string, FolderRowSnapshot> {
  const map = new Map<string, FolderRowSnapshot>();

  function walk(nodes: readonly WorkspaceFolderNode[], parentId: string | null) {
    nodes.forEach((node, index) => {
      const name = node.label.trim();
      if (!name) {
        return;
      }
      map.set(node.id, {
        folderId: node.id,
        name,
        parentFolderId: parentId,
        sortOrder: index,
      });
      if (node.children?.length) {
        walk(node.children, node.id);
      }
    });
  }

  walk(tree, null);
  return map;
}

export function rowsToWorkspaceTree(rows: Map<string, FolderPlaintextV2>): WorkspaceFolderNode[] {
  const childrenByParent = new Map<string | null, FolderPlaintextV2[]>();
  for (const row of rows.values()) {
    const list = childrenByParent.get(row.parentFolderId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentFolderId, list);
  }

  const build = (parentId: string | null): WorkspaceFolderNode[] => {
    const level = childrenByParent.get(parentId) ?? [];
    return level
      .sort(compareFolderSiblingOrder)
      .map((row) => {
        const children = build(row.folderId);
        return children.length
          ? { id: row.folderId, label: row.name, children }
          : { id: row.folderId, label: row.name };
      });
  };

  return build(null);
}

export type FolderTreeMutation =
  | { kind: "create"; folder: FolderPlaintextV2; idempotencyKey: string }
  | { kind: "update"; folder: FolderPlaintextV2 }
  | { kind: "delete"; tombstone: FolderPlaintextV2 };

export function diffWorkspaceFolderTrees(input: {
  workspaceId: string;
  previous: Map<string, FolderPlaintextV2>;
  nextTree: readonly WorkspaceFolderNode[];
  nowMs: number;
}): FolderTreeMutation[] {
  const nextRows = workspaceTreeToRowMap(input.nextTree);
  const mutations: FolderTreeMutation[] = [];

  for (const [folderId, snapshot] of nextRows) {
    const existing = input.previous.get(folderId);
    if (!existing) {
      mutations.push({
        kind: "create",
        idempotencyKey: generateEntityId(),
        folder: {
          schemaVersion: 2,
          folderId,
          workspaceId: input.workspaceId,
          name: snapshot.name,
          parentFolderId: snapshot.parentFolderId,
          sortOrder: snapshot.sortOrder,
          createdAtMs: input.nowMs,
          updatedAtMs: input.nowMs,
        },
      });
      continue;
    }
    if (
      existing.name !== snapshot.name ||
      existing.parentFolderId !== snapshot.parentFolderId ||
      (existing.sortOrder ?? 0) !== snapshot.sortOrder
    ) {
      mutations.push({
        kind: "update",
        folder: {
          ...existing,
          name: snapshot.name,
          parentFolderId: snapshot.parentFolderId,
          sortOrder: snapshot.sortOrder,
          updatedAtMs: input.nowMs,
        },
      });
    }
  }

  for (const folderId of input.previous.keys()) {
    if (!nextRows.has(folderId)) {
      mutations.push({
        kind: "delete",
        tombstone: createFolderDeleteTombstoneV2(folderId, input.workspaceId, input.nowMs),
      });
    }
  }

  return mutations;
}

export function normalizeWorkspaceFolderTreeForSave(tree: readonly WorkspaceFolderNode[]): WorkspaceFolderNode[] {
  return cloneTreeWithoutEmpty(tree);
}

function cloneTreeWithoutEmpty(nodes: readonly WorkspaceFolderNode[]): WorkspaceFolderNode[] {
  return nodes
    .map((node) => {
      const label = node.label.trim();
      if (!label) {
        return null;
      }
      const children = node.children?.length ? cloneTreeWithoutEmpty(node.children) : undefined;
      return children?.length ? { id: node.id, label, children } : { id: node.id, label };
    })
    .filter((node): node is WorkspaceFolderNode => node !== null);
}
