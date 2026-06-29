import type { ItemPlaintextV2 } from "@okkey/types";

export function withItemArchivedState(item: ItemPlaintextV2, archived: boolean): ItemPlaintextV2 {
  if (item.deleted) {
    throw new Error("CANNOT_ARCHIVE_DELETED_ITEM");
  }
  const updated: ItemPlaintextV2 = {
    ...item,
    updatedAtMs: Date.now(),
  };
  if (archived) {
    updated.archived = true;
  } else {
    delete updated.archived;
  }
  return updated;
}
