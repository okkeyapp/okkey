import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";
import {
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  parseAndNormalizeItemPlaintextUtf8,
} from "@okkey/types";

const ITEM_TYPES = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);

const SUPPORTED_PAYLOAD_SCHEMA_VERSIONS = new Set<number>([
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
]);

export interface ItemVaultReplayState {
  /** Latest materialized state per item id (always normalized to v2). */
  items: Map<string, ItemPlaintextV2>;
}

/**
 * Deterministic replay of ITEM_* events for a vault stream (after decrypting ciphertext).
 * v1 and v2 plaintext JSON are normalized to {@link ItemPlaintextV2}.
 * Unknown `payloadSchemaVersion` values are skipped (see sync architecture).
 */
export async function replayItemPlaintextEvents(
  events: SyncEventWireDto[],
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
): Promise<ItemVaultReplayState> {
  const items = new Map<string, ItemPlaintextV2>();
  for (const ev of events) {
    if (!ITEM_TYPES.has(ev.eventType)) {
      continue;
    }
    if (!SUPPORTED_PAYLOAD_SCHEMA_VERSIONS.has(ev.payloadSchemaVersion)) {
      continue;
    }
    const plaintextBytes = await decryptWirePayload(ev.encryptedPayload);
    const parsed = parseAndNormalizeItemPlaintextUtf8(plaintextBytes);
    if (!parsed) {
      continue;
    }
    if (parsed.deleted) {
      items.delete(parsed.itemId);
    } else {
      items.set(parsed.itemId, parsed);
    }
  }
  return { items };
}
