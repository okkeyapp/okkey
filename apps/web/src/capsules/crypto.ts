import {
  decryptCapsuleMetadata,
  encodeCapsuleKeyFragment,
  encryptCapsuleMetadata,
  encryptCapsulePayload,
  generateCapsuleKey,
  unwrapCapsuleKeyForOwner,
  wipeBytes,
  wrapCapsuleKeyForOwner,
} from "@okkey/crypto";
import type { EncryptedBlobDto } from "@okkey/types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface CapsuleOwnerMetadata {
  name: string;
  fileName?: string;
  itemTitle?: string;
}

export async function buildEncryptedCapsule(input: {
  accountVaultKey: Uint8Array;
  payload: unknown;
  metadata: CapsuleOwnerMetadata;
}): Promise<{
  capsuleKey: Uint8Array;
  encryptedPayload: EncryptedBlobDto;
  encryptedMetadata: EncryptedBlobDto;
  ownerKeyWrap: EncryptedBlobDto;
  fragment: string;
}> {
  const capsuleKey = await generateCapsuleKey();
  try {
    const [payload, metadata, ownerWrap] = await Promise.all([
      encryptCapsulePayload(capsuleKey, encoder.encode(JSON.stringify(input.payload))),
      encryptCapsuleMetadata(capsuleKey, encoder.encode(JSON.stringify(input.metadata))),
      wrapCapsuleKeyForOwner(input.accountVaultKey, capsuleKey),
    ]);
    return {
      capsuleKey,
      encryptedPayload: bytesToBlob(payload, "capsule_payload"),
      encryptedMetadata: bytesToBlob(metadata, "capsule_owner_metadata"),
      ownerKeyWrap: bytesToBlob(ownerWrap, "capsule_owner_key_wrap"),
      fragment: encodeCapsuleKeyFragment(capsuleKey),
    };
  } catch (error) {
    wipeBytes(capsuleKey);
    throw error;
  }
}

export async function decryptOwnerCapsuleMetadata(
  accountVaultKey: Uint8Array,
  encryptedMetadata: EncryptedBlobDto,
  ownerKeyWrap: EncryptedBlobDto,
): Promise<CapsuleOwnerMetadata> {
  const capsuleKey = await unwrapCapsuleKeyForOwner(accountVaultKey, blobToBytes(ownerKeyWrap));
  try {
    const plaintext = await decryptCapsuleMetadata(capsuleKey, blobToBytes(encryptedMetadata));
    return JSON.parse(decoder.decode(plaintext)) as CapsuleOwnerMetadata;
  } finally {
    wipeBytes(capsuleKey);
  }
}

export async function recoverOwnerCapsuleFragment(
  accountVaultKey: Uint8Array,
  ownerKeyWrap: EncryptedBlobDto,
): Promise<string> {
  const capsuleKey = await unwrapCapsuleKeyForOwner(accountVaultKey, blobToBytes(ownerKeyWrap));
  try {
    return encodeCapsuleKeyFragment(capsuleKey);
  } finally {
    wipeBytes(capsuleKey);
  }
}

export function releaseCapsuleKey(key: Uint8Array): void {
  wipeBytes(key);
}

export function bytesToBlob(bytes: Uint8Array, entity: string): EncryptedBlobDto {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: btoa(binary),
    meta: { entity },
  };
}

export function blobToBytes(blob: EncryptedBlobDto): Uint8Array {
  const binary = atob(blob.payload);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
