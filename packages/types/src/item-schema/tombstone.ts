import type { ItemPlaintextV2 } from "./types.js";
import { ITEM_CATEGORY_SECURE_NOTE, ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "./types.js";

/** Minimal encrypted tombstone for ITEM_DELETE (opaque to server). */
export function createItemDeleteTombstoneV2(itemId: string, vaultId: string): ItemPlaintextV2 {
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId,
    vaultId,
    title: "",
    categoryId: ITEM_CATEGORY_SECURE_NOTE,
    createdAtMs: 0,
    updatedAtMs: Date.now(),
    deleted: true,
    sections: [],
    fields: [],
  };
}
