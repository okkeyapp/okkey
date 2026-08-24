export const CAPSULE_TABLE_COLUMNS_STORAGE_KEY = "okkey.capsules.visibleColumns";

export const CAPSULE_TABLE_COLUMN_IDS = ["name", "type", "created", "active", "views", "password"] as const;

export type CapsuleTableColumnId = (typeof CAPSULE_TABLE_COLUMN_IDS)[number];

export const CAPSULE_TABLE_LOCKED_COLUMN: CapsuleTableColumnId = "name";

export const CAPSULE_TABLE_COLUMN_LABELS: Record<CapsuleTableColumnId, string> = {
  name: "Название",
  type: "Тип",
  created: "Создан",
  active: "Активен",
  views: "Просмотров",
  password: "С паролем",
};

const DEFAULT_VISIBLE_COLUMNS: readonly CapsuleTableColumnId[] = CAPSULE_TABLE_COLUMN_IDS;

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

export function buildCapsulePageItems(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, page]);
  if (page - 1 >= 1) pages.add(page - 1);
  if (page + 1 <= pageCount) pages.add(page + 1);

  if (page <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(pageCount - 1);
    pages.add(pageCount - 2);
  }
  if (page >= pageCount - 2) {
    pages.add(pageCount - 1);
    pages.add(pageCount - 2);
    pages.add(2);
    pages.add(3);
  }

  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  for (const value of sorted) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && value - previous > 1) {
      items.push("ellipsis");
    }
    items.push(value);
  }
  return items;
}
