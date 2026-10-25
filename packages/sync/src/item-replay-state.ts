import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";

function isItemDeleteTombstone(parsed: ItemPlaintextV2, eventType: string): boolean {
  if (eventType === "ITEM_DELETE") {
    return true;
  }
  return (
    Boolean(parsed.deleted) &&
    parsed.sections.length === 0 &&
    parsed.fields.length === 0 &&
    !parsed.title.trim()
  );
}

/**
 * Whether replay should materialize this event as a soft-delete.
 * Prefer the server-persisted `itemSoftDeleted` hint; fall back to plaintext only for
 * legacy events where the hint is unset (null/undefined).
 */
export function shouldApplyItemSoftDelete(
  parsed: Pick<ItemPlaintextV2, "deleted">,
  event: Pick<SyncEventWireDto, "eventType" | "itemSoftDeleted">,
): boolean {
  if (event.eventType === "ITEM_DELETE") {
    return true;
  }
  if (event.eventType !== "ITEM_UPDATE") {
    return Boolean(parsed.deleted);
  }
  if (event.itemSoftDeleted === true) {
    return true;
  }
  if (event.itemSoftDeleted === false) {
    return false;
  }
  // Legacy events without a persisted hint: trust plaintext.
  return Boolean(parsed.deleted);
}

/** Apply decrypted item plaintext to materialized replay map (soft-delete aware). */
export function applyItemPlaintextToReplayMap(
  items: Map<string, ItemPlaintextV2>,
  parsed: ItemPlaintextV2,
  event: Pick<SyncEventWireDto, "eventType" | "createdAt" | "itemSoftDeleted">,
): void {
  const isDeleted = shouldApplyItemSoftDelete(parsed, event);
  if (!isDeleted) {
    items.set(parsed.itemId, {
      ...parsed,
      deleted: false,
      deletedAtMs: undefined,
    });
    return;
  }

  const deletedAtMs =
    parsed.deletedAtMs ??
    parsed.updatedAtMs ??
    (Date.parse(event.createdAt) || Date.now());
  const previous = items.get(parsed.itemId);
  if (previous && isItemDeleteTombstone(parsed, event.eventType)) {
    items.set(parsed.itemId, {
      ...previous,
      deleted: true,
      deletedAtMs,
      updatedAtMs: parsed.updatedAtMs,
    });
    return;
  }

  items.set(parsed.itemId, {
    ...parsed,
    deleted: true,
    deletedAtMs,
  });
}
