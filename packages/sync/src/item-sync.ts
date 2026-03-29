import type { EncryptedBlobDto, ItemPlaintextV2, SyncAppendEventRequestDto } from "@okkey/types";
import {
  assertCryptoVersionNotBelowFloor,
  createItemDeleteTombstoneV2,
  ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
} from "@okkey/types";
import { encryptVaultItemPayload } from "@okkey/crypto/vault-item";
import { wipeBytes } from "@okkey/crypto";

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

function assertBytes(value: Uint8Array | undefined, fieldName: string): Uint8Array {
  if (!value) {
    throw new Error(`${fieldName} is not initialized`);
  }
  return value;
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
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = await encodeItemPlaintextUtf8(item);
    encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
    return {
      eventType: "ITEM_CREATE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      ),
      baseVersion,
      idempotencyKey,
      clientCreatedAt,
    };
  } finally {
    wipeBytes(plaintext);
    wipeBytes(encrypted);
  }
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
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = await encodeItemPlaintextUtf8(item);
    encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
    return {
      eventType: "ITEM_UPDATE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      ),
      baseVersion,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      clientCreatedAt,
    };
  } finally {
    wipeBytes(plaintext);
    wipeBytes(encrypted);
  }
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
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = await encodeItemPlaintextUtf8(tombstone);
    encrypted = await encryptVaultItemPayload(vaultKey, plaintext);
    return {
      eventType: "ITEM_DELETE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        ITEM_PLAINTEXT_SCHEMA_VERSION_LATEST,
      ),
      baseVersion,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      clientCreatedAt,
    };
  } finally {
    wipeBytes(plaintext);
    wipeBytes(encrypted);
  }
}
