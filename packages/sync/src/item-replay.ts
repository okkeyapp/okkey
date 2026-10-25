import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";
import {
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  parseAndNormalizeItemPlaintextUtf8,
} from "@okkey/types";
import { itemPlaintextMatchesReferencedId } from "./item-id-binding.js";
import { applyItemPlaintextToReplayMap } from "./item-replay-state.js";

const ITEM_TYPES = new Set(["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"]);

const SUPPORTED_PAYLOAD_SCHEMA_VERSIONS = new Set<number>([
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
]);

function getEventBlob(event: SyncEventWireDto): { crypto_version: number; payload: string } {
  const maybe = event as SyncEventWireDto & {
    encryptedBlob?: { crypto_version?: number; payload?: string };
    payloadSchemaVersion?: number;
    encryptedPayload?: string;
  };
  if (maybe.encryptedBlob?.payload) {
    return {
      crypto_version: maybe.encryptedBlob.crypto_version ?? 2,
      payload: maybe.encryptedBlob.payload,
    };
  }
  return {
    crypto_version: maybe.payloadSchemaVersion ?? 2,
    payload: maybe.encryptedPayload ?? "",
  };
}

export interface ItemVaultReplayState {
  /** Latest materialized state per item id (always normalized to v2). */
  items: Map<string, ItemPlaintextV2>;
}

export type DecryptWirePayload = (
  encryptedPayloadBase64: string,
  itemId?: string | null,
) => Promise<Uint8Array>;

/**
 * Deterministic replay of ITEM_* events for a vault stream (after decrypting ciphertext).
 * v1 and v2 plaintext JSON are normalized to {@link ItemPlaintextV2}.
 * Unknown `encryptedBlob.crypto_version` values are skipped (see sync architecture).
 * Events whose plaintext.itemId ≠ referencedItemId are skipped.
 */
export async function replayItemPlaintextEvents(
  events: SyncEventWireDto[],
  decryptWirePayload: DecryptWirePayload,
): Promise<ItemVaultReplayState> {
  const items = new Map<string, ItemPlaintextV2>();
  for (const ev of events) {
    if (!ITEM_TYPES.has(ev.eventType)) {
      continue;
    }
    const blob = getEventBlob(ev);
    if (!SUPPORTED_PAYLOAD_SCHEMA_VERSIONS.has(blob.crypto_version)) {
      continue;
    }
    const plaintextBytes = await decryptWirePayload(blob.payload, ev.referencedItemId);
    const parsed = parseAndNormalizeItemPlaintextUtf8(plaintextBytes);
    if (!parsed) {
      continue;
    }
    if (!itemPlaintextMatchesReferencedId(parsed, ev)) {
      continue;
    }
    const itemId = ev.referencedItemId ?? parsed.itemId;
    if (ev.eventType === "ITEM_UPDATE" && !items.has(itemId)) {
      // Mirror SyncReplayEngine: do not materialize UPDATE for unknown ids.
      continue;
    }
    if (
      ev.eventType === "ITEM_UPDATE" &&
      Boolean(parsed.deleted) &&
      ev.itemSoftDeleted === false
    ) {
      continue;
    }
    applyItemPlaintextToReplayMap(items, parsed, ev);
  }
  return { items };
}
