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

/** Apply decrypted item plaintext to materialized replay map (soft-delete aware). */
export function applyItemPlaintextToReplayMap(
  items: Map<string, ItemPlaintextV2>,
  parsed: ItemPlaintextV2,
  event: Pick<SyncEventWireDto, "eventType" | "createdAt">,
): void {
  const isDeleted = Boolean(parsed.deleted) || event.eventType === "ITEM_DELETE";
  if (!isDeleted) {
    items.set(parsed.itemId, parsed);
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
