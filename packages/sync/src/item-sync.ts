import type { ItemPlaintextV2, SyncAppendEventRequestDto } from "@okkey/types";
import { createItemDeleteTombstoneV2, ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST } from "@okkey/types";
import { encryptVaultItemPayload } from "@okkey/crypto/vault-item";

function uint8ArrayToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

const encoder = new TextEncoder();

export async function encodeItemPlaintextUtf8(item: ItemPlaintextV2): Promise<Uint8Array> {
  return encoder.encode(JSON.stringify(item));
}

export async function buildItemCreateAppendRequest(
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  baseVersion: number,
  idempotencyKey: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  const plaintext = await encodeItemPlaintextUtf8(item);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_CREATE",
    encryptedPayload: uint8ArrayToStandardBase64(encrypted),
    baseVersion,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    idempotencyKey,
    clientCreatedAt,
  };
}

export async function buildItemUpdateAppendRequest(
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  baseVersion: number,
  idempotencyKey?: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  const plaintext = await encodeItemPlaintextUtf8(item);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_UPDATE",
    encryptedPayload: uint8ArrayToStandardBase64(encrypted),
    baseVersion,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    clientCreatedAt,
  };
}

export async function buildItemDeleteAppendRequest(
  vaultKey: Uint8Array,
  vaultId: string,
  itemId: string,
  baseVersion: number,
  idempotencyKey?: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  const tombstone = createItemDeleteTombstoneV2(itemId, vaultId);
  const plaintext = await encodeItemPlaintextUtf8(tombstone);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_DELETE",
    encryptedPayload: uint8ArrayToStandardBase64(encrypted),
    baseVersion,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    clientCreatedAt,
  };
}
