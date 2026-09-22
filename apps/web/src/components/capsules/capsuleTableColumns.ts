import { LIST_PAGE_SIZE } from "../../lists/listPageSize";

export const CAPSULE_TABLE_COLUMNS_STORAGE_KEY = "okkey.capsules.visibleColumns";

export const CAPSULE_TABLE_COLUMN_IDS = [
  "name",
  "type",
  "created",
  "updated",
  "active",
  "views",
  "password",
] as const;

export type CapsuleTableColumnId = (typeof CAPSULE_TABLE_COLUMN_IDS)[number];

export const CAPSULE_TABLE_LOCKED_COLUMN: CapsuleTableColumnId = "name";

export const CAPSULE_TABLE_COLUMN_MESSAGE_KEYS: Record<CapsuleTableColumnId, string> = {
  name: "web.capsules.list.column.name",
  type: "web.capsules.list.column.type",
  created: "web.capsules.list.column.created",
  updated: "web.capsules.list.column.updated",
  active: "web.capsules.list.column.active",
  views: "web.capsules.list.column.views",
  password: "web.capsules.list.column.password",
};

export function capsuleTableColumnLabel(
  t: (messageKey: string) => string,
  columnId: CapsuleTableColumnId,
): string {
  return t(CAPSULE_TABLE_COLUMN_MESSAGE_KEYS[columnId]);
}

/** Page size for the capsules owner list (aligned with shared LIST_PAGE_SIZE). */
export const CAPSULE_TABLE_PAGE_SIZE = LIST_PAGE_SIZE;

/** Skeleton rows before the first successful list response (total still unknown). */
export const CAPSULE_TABLE_INITIAL_SKELETON_ROWS = 5;

const DEFAULT_VISIBLE_COLUMNS: readonly CapsuleTableColumnId[] = CAPSULE_TABLE_COLUMN_IDS.filter(
  (columnId) => columnId !== "updated",
);

function isColumnId(value: unknown): value is CapsuleTableColumnId {
  return CAPSULE_TABLE_COLUMN_IDS.includes(value as CapsuleTableColumnId);
}

export function normalizeVisibleCapsuleColumns(
  columns: readonly CapsuleTableColumnId[],
): CapsuleTableColumnId[] {
  const visible = new Set(columns);
  visible.add(CAPSULE_TABLE_LOCKED_COLUMN);
  return CAPSULE_TABLE_COLUMN_IDS.filter((columnId) => visible.has(columnId));
}

export function loadVisibleCapsuleColumns(): CapsuleTableColumnId[] {
  try {
    const raw = localStorage.getItem(CAPSULE_TABLE_COLUMNS_STORAGE_KEY);
    if (!raw) {
      return [...DEFAULT_VISIBLE_COLUMNS];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...DEFAULT_VISIBLE_COLUMNS];
    }
    const columns = parsed.filter(isColumnId);
    return columns.length > 0 ? normalizeVisibleCapsuleColumns(columns) : [...DEFAULT_VISIBLE_COLUMNS];
  } catch {
    return [...DEFAULT_VISIBLE_COLUMNS];
  }
}

export function saveVisibleCapsuleColumns(columns: readonly CapsuleTableColumnId[]): void {
  try {
    localStorage.setItem(
      CAPSULE_TABLE_COLUMNS_STORAGE_KEY,
      JSON.stringify(normalizeVisibleCapsuleColumns(columns)),
    );
  } catch {
    // Ignore quota / private-mode failures; the in-memory state still applies.
  }
}

export function capsulePageRowCount(page: number, total: number, pageSize = CAPSULE_TABLE_PAGE_SIZE): number {
  if (total <= 0) {
    return CAPSULE_TABLE_INITIAL_SKELETON_ROWS;
  }
  const safePage = Math.max(1, page);
  const remaining = total - (safePage - 1) * pageSize;
  return Math.max(1, Math.min(pageSize, remaining));
}

/**
 * Compact pagination: all pages when ≤7, otherwise first/last + window with "…".
 * Never renders one button per page when there are many pages.
 */
export function buildCapsulePageItems(page: number, pageCount: number): Array<number | "ellipsis"> {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);

  if (safePageCount <= 7) {
    return Array.from({ length: safePageCount }, (_, index) => index + 1);
  }

  if (safePage <= 3) {
    return [1, 2, 3, 4, "ellipsis", safePageCount];
  }

  if (safePage >= safePageCount - 2) {
    return [1, "ellipsis", safePageCount - 3, safePageCount - 2, safePageCount - 1, safePageCount];
  }

  return [1, "ellipsis", safePage - 1, safePage, safePage + 1, "ellipsis", safePageCount];
}
