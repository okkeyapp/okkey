import type { ItemPlaintextV2 } from "@okkey/types";

/** Sentinel select value meaning no linked login account. */
export const NO_LINKED_ACCOUNT_VALUE = "";

export type LinkedAccountResolution =
  | { status: "none" }
  | { status: "ok"; item: ItemPlaintextV2 }
  | { status: "lost"; linkedAccountItemId: string };

/**
 * Resolve a login item's optional `linkedAccountItemId` against the unlocked vault.
 * Targets that are missing, soft-deleted, or not login items count as a broken link.
 */
export function resolveLinkedAccountItem(
  linkedAccountItemId: string | undefined,
  lookup: (itemId: string) => ItemPlaintextV2 | undefined,
): LinkedAccountResolution {
  const id = typeof linkedAccountItemId === "string" ? linkedAccountItemId.trim() : "";
  if (!id) {
    return { status: "none" };
  }
  const item = lookup(id);
  if (!item || item.deleted || item.categoryId !== "login") {
    return { status: "lost", linkedAccountItemId: id };
  }
  return { status: "ok", item };
}

/** Drop `linkedAccountItemId` from plaintext (Clear broken-link / edit clear). */
export function clearLinkedAccountItemId(item: ItemPlaintextV2, nowMs = Date.now()): ItemPlaintextV2 {
  if (!item.linkedAccountItemId) {
    return item;
  }
  const { linkedAccountItemId: _removed, ...rest } = item;
  return {
    ...rest,
    updatedAtMs: nowMs,
  };
}

/** Normalize a picker value: empty / sentinel → undefined for storage. */
export function normalizeLinkedAccountItemId(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === NO_LINKED_ACCOUNT_VALUE) {
    return undefined;
  }
  return trimmed;
}
