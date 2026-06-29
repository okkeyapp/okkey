import type { ItemPlaintextV2, SyncEventWireDto } from "@okkey/types";
import {
  ITEM_PLAINTEXT_SCHEMA_VERSION,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  parseAndNormalizeItemPlaintextUtf8,
} from "@okkey/types";
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

/**
 * Deterministic replay of ITEM_* events for a vault stream (after decrypting ciphertext).
 * v1 and v2 plaintext JSON are normalized to {@link ItemPlaintextV2}.
 * Unknown `encryptedBlob.crypto_version` values are skipped (see sync architecture).
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
    const blob = getEventBlob(ev);
    if (!SUPPORTED_PAYLOAD_SCHEMA_VERSIONS.has(blob.crypto_version)) {
      continue;
    }
    const plaintextBytes = await decryptWirePayload(blob.payload);
    const parsed = parseAndNormalizeItemPlaintextUtf8(plaintextBytes);
    if (!parsed) {
      continue;
    }
    applyItemPlaintextToReplayMap(items, parsed, ev);
  }
  return { items };
}
