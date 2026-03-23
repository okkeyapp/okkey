import type { ItemPlaintextV1 } from "../item-plaintext-v1.js";
import { ITEM_CATEGORY_SECURE_NOTE } from "./types.js";
import type { ItemPlaintextV2 } from "./types.js";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "./types.js";
import { createPresetItemPlaintextV2 } from "./categories.js";

/**
 * Upgrade legacy v1 payloads to v2. v1 had no body fields — map to `secure_note` with empty note body.
 */
export function migrateItemPlaintextV1ToV2(v1: ItemPlaintextV1): ItemPlaintextV2 {
  const base = createPresetItemPlaintextV2({
    categoryId: ITEM_CATEGORY_SECURE_NOTE,
    itemId: v1.itemId,
    vaultId: v1.vaultId,
    title: v1.title,
    nowMs: v1.createdAtMs,
  });
  return {
    ...base,
    updatedAtMs: v1.updatedAtMs,
    deleted: v1.deleted,
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
  };
}
