import type { EncryptedBlobDto, ItemPlaintextV2, SyncAppendEventRequestDto } from "@okkey/types";
import {
  assertCryptoVersionNotBelowFloor,
  createItemDeleteTombstoneV2,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
} from "@okkey/types";
import { encryptVaultItemPayload } from "@okkey/crypto/vault-item";

function uint8ArrayToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

const encoder = new TextEncoder();

function toEncryptedBlob(payloadBase64: string, cryptoVersion: number): EncryptedBlobDto {
  return {
    crypto_version: cryptoVersion,
    algorithm: "opaque",
    payload: payloadBase64,
    meta: {},
  };
}

export async function encodeItemPlaintextUtf8(item: ItemPlaintextV2): Promise<Uint8Array> {
  return encoder.encode(JSON.stringify(item));
}

export interface ItemAppendBuildOptions {
  /** `MAX(crypto_version)` from replayed vault events; omit if unknown. */
  establishedCryptoFloor?: number | null;
}

export async function buildItemCreateAppendRequest(
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  baseVersion: number,
  idempotencyKey: string,
  clientCreatedAt?: string,
  options?: ItemAppendBuildOptions,
): Promise<SyncAppendEventRequestDto> {
  assertCryptoVersionNotBelowFloor(
    options?.establishedCryptoFloor ?? null,
    ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  );
  const plaintext = await encodeItemPlaintextUtf8(item);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_CREATE",
    encryptedBlob: toEncryptedBlob(
      uint8ArrayToStandardBase64(encrypted),
      ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    ),
    baseVersion,
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
  options?: ItemAppendBuildOptions,
): Promise<SyncAppendEventRequestDto> {
  assertCryptoVersionNotBelowFloor(
    options?.establishedCryptoFloor ?? null,
    ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  );
  const plaintext = await encodeItemPlaintextUtf8(item);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_UPDATE",
    encryptedBlob: toEncryptedBlob(
      uint8ArrayToStandardBase64(encrypted),
      ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    ),
    baseVersion,
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
  options?: ItemAppendBuildOptions,
): Promise<SyncAppendEventRequestDto> {
  assertCryptoVersionNotBelowFloor(
    options?.establishedCryptoFloor ?? null,
    ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
  );
  const tombstone = createItemDeleteTombstoneV2(itemId, vaultId);
  const plaintext = await encodeItemPlaintextUtf8(tombstone);
  const encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
  return {
    eventType: "ITEM_DELETE",
    encryptedBlob: toEncryptedBlob(
      uint8ArrayToStandardBase64(encrypted),
      ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
    ),
    baseVersion,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    clientCreatedAt,
  };
}
