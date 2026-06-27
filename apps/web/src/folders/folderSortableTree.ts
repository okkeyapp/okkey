import { arrayMove } from "@dnd-kit/sortable";

import type { WorkspaceFolderNode } from "./workspaceFolderTree";

export type FlattenedFolderItem = {
  id: string;
  label: string;
  children: WorkspaceFolderNode[];
  parentId: string | null;
  depth: number;
  index: number;
};

export type FolderTreeProjection = {
  depth: number;
  maxDepth: number;
  minDepth: number;
  parentId: string | null;
};

function getDragDepth(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth);
}

function getMaxDepth({ previousItem }: { previousItem: FlattenedFolderItem | undefined }): number {
  if (previousItem) {
    return previousItem.depth + 1;
  }
  return 0;
}

function getMinDepth({ nextItem }: { nextItem: FlattenedFolderItem | undefined }): number {
  if (nextItem) {
    return nextItem.depth;
  }
  return 0;
}

export function flattenFolderTree(
  nodes: readonly WorkspaceFolderNode[],
  parentId: string | null = null,
  depth = 0,
): FlattenedFolderItem[] {
  return nodes.reduce<FlattenedFolderItem[]>((accumulator, node, index) => {
    const children = node.children ?? [];
    return [
      ...accumulator,
      {
        id: node.id,
        label: node.label,
        children,
        parentId,
        depth,
        index,
      },
      ...flattenFolderTree(children, node.id, depth + 1),
    ];
  }, []);
}

export function buildFolderTree(flattenedItems: readonly FlattenedFolderItem[]): WorkspaceFolderNode[] {
  type MutableFolderItem = {
    id: string;
    label: string;
    children: MutableFolderItem[];
    parentId: string | null;
    depth: number;
    index: number;
  };

  const root: MutableFolderItem = {
    id: "root",
    label: "",
    children: [],
    parentId: null,
    depth: -1,
    index: -1,
  };
  const nodes: Record<string, MutableFolderItem> = { root };
  const items: MutableFolderItem[] = flattenedItems.map((item) => ({
    ...item,
    children: [],
  }));

  for (const item of items) {
    const parentId = item.parentId ?? root.id;
    const parent = nodes[parentId] ?? items.find((entry) => entry.id === parentId);
    nodes[item.id] = item;
    parent?.children.push(item);
  }

  return root.children.map(stripFolderTreeNode);
}

function stripFolderTreeNode(item: {
  id: string;
  label: string;
  children: { id: string; label: string; children: unknown[] }[];
}): WorkspaceFolderNode {
  return {
    id: item.id,
    label: item.label,
    ...(item.children.length > 0 ? { children: item.children.map(stripFolderTreeNode) } : {}),
  };
}

export function getFolderTreeProjection(
  items: readonly FlattenedFolderItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number,
): FolderTreeProjection | null {
  const overItemIndex = items.findIndex((item) => item.id === overId);
  const activeItemIndex = items.findIndex((item) => item.id === activeId);
  if (overItemIndex < 0 || activeItemIndex < 0) {
    return null;
  }

  const activeItem = items[activeItemIndex]!;
  const newItems = arrayMove([...items], activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = getDragDepth(dragOffset, indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = getMaxDepth({ previousItem });
  const minDepth = getMinDepth({ nextItem });

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) {
    depth = maxDepth;
  } else if (projectedDepth < minDepth) {
    depth = minDepth;
  }

  function getParentId(): string | null {
    if (depth === 0 || !previousItem) {
      return null;
    }
    if (depth === previousItem.depth) {
      return previousItem.parentId;
    }
    if (depth > previousItem.depth) {
      return previousItem.id;
    }
    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;
    return newParent ?? null;
  }

  return { depth, maxDepth, minDepth, parentId: getParentId() };
}

export function removeFolderChildrenOf(
  items: readonly FlattenedFolderItem[],
  ids: readonly string[],
): FlattenedFolderItem[] {
  const excludeParentIds = [...ids];

  return items.filter((item) => {
    if (item.parentId && excludeParentIds.includes(item.parentId)) {
      if (item.children.length > 0) {
        excludeParentIds.push(item.id);
      }
      return false;
    }
    return true;
  });
}

export function getFolderDescendantCount(nodes: readonly WorkspaceFolderNode[], id: string): number {
  function walk(items: readonly WorkspaceFolderNode[]): WorkspaceFolderNode | undefined {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.children?.length) {
        const nested = walk(item.children);
        if (nested) {
          return nested;
        }
      }
    }
    return undefined;
  }

  function countChildren(items: readonly WorkspaceFolderNode[], count = 0): number {
    return items.reduce((accumulator, item) => {
      if (item.children?.length) {
        return countChildren(item.children, accumulator + 1);
      }
      return accumulator + 1;
    }, count);
  }

  const item = walk(nodes);
  return item?.children?.length ? countChildren(item.children) : 0;
}

export function applyFolderTreeDrag(
  tree: readonly WorkspaceFolderNode[],
  activeId: string,
  overId: string,
  projection: Pick<FolderTreeProjection, "depth" | "parentId">,
): WorkspaceFolderNode[] {
  const clonedItems = flattenFolderTree(tree);
  const overIndex = clonedItems.findIndex((item) => item.id === overId);
  const activeIndex = clonedItems.findIndex((item) => item.id === activeId);
  if (overIndex < 0 || activeIndex < 0) {
    return [...tree];
  }

  const activeTreeItem = clonedItems[activeIndex]!;
  clonedItems[activeIndex] = {
    ...activeTreeItem,
    depth: projection.depth,
    parentId: projection.parentId,
  };

  const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);
  return buildFolderTree(sortedItems);
}
