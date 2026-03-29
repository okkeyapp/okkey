import type {
  EncryptedBlobDto,
  FolderPlaintextV1,
  ItemFolderAssignPlaintextV1,
  SyncAppendEventRequestDto,
} from "@okkey/types";
import {
  FOLDER_PLAINTEXT_SCHEMA_VERSION,
  ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
} from "@okkey/types";
import { encryptPersonalVaultMetadataPayload, wipeBytes } from "@okkey/crypto";

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

export async function buildFolderCreateAppendRequest(
  personalMetadataKey: Uint8Array,
  folder: FolderPlaintextV1,
  baseVersion: number,
  idempotencyKey: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = encoder.encode(JSON.stringify(folder));
    encrypted = await encryptPersonalVaultMetadataPayload(personalMetadataKey, plaintext);
    return {
      eventType: "FOLDER_CREATE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        FOLDER_PLAINTEXT_SCHEMA_VERSION,
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

export async function buildFolderUpdateAppendRequest(
  personalMetadataKey: Uint8Array,
  folder: FolderPlaintextV1,
  baseVersion: number,
  idempotencyKey?: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = encoder.encode(JSON.stringify(folder));
    encrypted = await encryptPersonalVaultMetadataPayload(personalMetadataKey, plaintext);
    return {
      eventType: "FOLDER_UPDATE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        FOLDER_PLAINTEXT_SCHEMA_VERSION,
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

export async function buildFolderDeleteAppendRequest(
  personalMetadataKey: Uint8Array,
  tombstone: FolderPlaintextV1,
  baseVersion: number,
  idempotencyKey?: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = encoder.encode(JSON.stringify(tombstone));
    encrypted = await encryptPersonalVaultMetadataPayload(personalMetadataKey, plaintext);
    return {
      eventType: "FOLDER_DELETE",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        FOLDER_PLAINTEXT_SCHEMA_VERSION,
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

export async function buildItemFolderAssignAppendRequest(
  personalMetadataKey: Uint8Array,
  assign: ItemFolderAssignPlaintextV1,
  baseVersion: number,
  idempotencyKey?: string,
  clientCreatedAt?: string,
): Promise<SyncAppendEventRequestDto> {
  let plaintext: Uint8Array | undefined;
  let encrypted: Uint8Array | undefined;
  try {
    plaintext = encoder.encode(JSON.stringify(assign));
    encrypted = await encryptPersonalVaultMetadataPayload(personalMetadataKey, plaintext);
    return {
      eventType: "ITEM_FOLDER_ASSIGN",
      encryptedBlob: toEncryptedBlob(
        uint8ArrayToStandardBase64(assertBytes(encrypted, "encrypted")),
        ITEM_FOLDER_ASSIGN_SCHEMA_VERSION,
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
