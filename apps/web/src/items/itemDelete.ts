import type { ItemPlaintextV2 } from "@okkey/types";

export function withItemDeletedState(item: ItemPlaintextV2, deleted: boolean): ItemPlaintextV2 {
  const updated: ItemPlaintextV2 = {
    ...item,
    updatedAtMs: Date.now(),
  };
  if (deleted) {
    updated.deleted = true;
    updated.deletedAtMs = Date.now();
    delete updated.archived;
  } else {
    delete updated.deleted;
    delete updated.deletedAtMs;
  }
  return updated;
}
