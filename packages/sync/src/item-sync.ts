import type { ItemPlaintextV1, SyncAppendEventRequestDto } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION } from "@okkey/types";
import { encryptVaultItemPayload } from "@okkey/crypto/vault-item";

function uint8ArrayToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

const encoder = new TextEncoder();

export async function encodeItemPlaintextUtf8(item: ItemPlaintextV1): Promise<Uint8Array> {
  return encoder.encode(JSON.stringify(item));
}

export async function buildItemCreateAppendRequest(
  vaultKey: Uint8Array,
  item: ItemPlaintextV1,
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
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    idempotencyKey,
    clientCreatedAt,
  };
}

export async function buildItemUpdateAppendRequest(
  vaultKey: Uint8Array,
  item: ItemPlaintextV1,
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
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
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
  const tombstone: ItemPlaintextV1 = {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    itemId,
    vaultId,
    title: "",
    createdAtMs: 0,
    updatedAtMs: Date.now(),
    deleted: true,
  };
  const plaintext = await encodeItemPlaintextUtf8(tombstone);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_DELETE",
    encryptedPayload: uint8ArrayToStandardBase64(encrypted),
    baseVersion,
    payloadSchemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    clientCreatedAt,
  };
}
