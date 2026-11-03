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
 * For ITEM_UPDATE, only the server-persisted `itemSoftDeleted === true` hint counts —
 * plaintext `deleted` alone must not hide/remove items (new writes always set the flag).
 */
export function shouldApplyItemSoftDelete(
  parsed: Pick<ItemPlaintextV2, "deleted">,
  event: Pick<SyncEventWireDto, "eventType" | "itemSoftDeleted">,
): boolean {
  if (event.eventType === "ITEM_DELETE") {
    return true;
  }
  if (event.eventType === "ITEM_UPDATE") {
    return event.itemSoftDeleted === true;
  }
  return Boolean(parsed.deleted);
}

/** True when ITEM_UPDATE plaintext claims delete without a server soft-delete mark. */
export function isUnmarkedItemSoftDelete(
  parsed: Pick<ItemPlaintextV2, "deleted">,
  event: Pick<SyncEventWireDto, "eventType" | "itemSoftDeleted">,
): boolean {
  return (
    event.eventType === "ITEM_UPDATE" &&
    Boolean(parsed.deleted) &&
    event.itemSoftDeleted !== true
  );
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
