import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";

/**
 * True when the decrypted plaintext item id matches the server-side referenced id.
 * Events without `referencedItemId` (legacy / non-item) are treated as matching.
 */
export function itemPlaintextMatchesReferencedId(
  parsed: Pick<ItemPlaintextV2, "itemId">,
  event: Pick<SyncEventWireDto, "referencedItemId">,
): boolean {
  const referenced = event.referencedItemId?.trim();
  if (!referenced) {
    return true;
  }
  return parsed.itemId === referenced;
}
