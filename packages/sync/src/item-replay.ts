import type { ItemPlaintextV1, SyncEventWireDto } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION } from "@okkey/types";

const ITEM_TYPES = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);

export interface ItemVaultReplayState {
  items: Map<string, ItemPlaintextV1>;
}

/**
 * Deterministic replay of ITEM_* events for a vault stream (after decrypting ciphertext).
 * Unknown `payloadSchemaVersion` values are skipped (see sync architecture).
 */
export async function replayItemPlaintextEvents(
  events: SyncEventWireDto[],
  decryptWirePayload: (encryptedPayloadBase64: string) => Promise<Uint8Array>,
): Promise<ItemVaultReplayState> {
  const items = new Map<string, ItemPlaintextV1>();
  for (const ev of events) {
    if (!ITEM_TYPES.has(ev.eventType)) {
      continue;
    }
    if (ev.payloadSchemaVersion !== ITEM_PLAINTEXT_SCHEMA_VERSION) {
      continue;
    }
    const plaintextBytes = await decryptWirePayload(ev.encryptedPayload);
    const text = new TextDecoder().decode(plaintextBytes);
    const parsed = JSON.parse(text) as ItemPlaintextV1;
    if (parsed.schemaVersion !== ITEM_PLAINTEXT_SCHEMA_VERSION) {
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
