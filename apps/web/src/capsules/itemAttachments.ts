import { decryptCapsulePayload, encryptCapsulePayload } from "@okkey/crypto";
import type { CoreClient } from "@okkey/api";
import type { EncryptedBlobDto, ItemPlaintextV2 } from "@okkey/types";
import type { KeyFieldFileValue } from "@okkey/ui";

import { downloadKeyFieldFileAttachment, downloadKeyFieldFileAttachmentBytes } from "../api/key-field-files";
import { resolveVaultItemEncryptionKey } from "../items/resolveVaultItemEncryptionKey";
import { blobToBytes, bytesToBlob } from "./crypto";

function fileFieldValue(field: ItemPlaintextV2["fields"][number]): KeyFieldFileValue | null {
  if (field.value.kind !== "file") {
    return null;
  }
  const attachmentId = field.value.attachmentId?.trim();
  if (!attachmentId) {
    return null;
  }
  return {
    attachmentId,
    name: field.value.name ?? "file",
    mimeType: field.value.mimeType ?? "application/octet-stream",
    sizeBytes: field.value.sizeBytes ?? 0,
  };
}

export async function buildItemCapsuleAttachmentPayloads(input: {
  accessToken: string;
  vaultKey: Uint8Array;
  item: ItemPlaintextV2;
  capsuleKey: Uint8Array;
}): Promise<Record<string, EncryptedBlobDto>> {
  const payloads: Record<string, EncryptedBlobDto> = {};
  for (const field of input.item.fields) {
    const file = fileFieldValue(field);
    if (!file) {
      continue;
    }
    const downloaded = await downloadKeyFieldFileAttachmentBytes({
      accessToken: input.accessToken,
      vaultId: input.item.vaultId,
      itemId: input.item.itemId,
      vaultKey: input.vaultKey,
      file,
    });
    const encrypted = await encryptCapsulePayload(input.capsuleKey, downloaded.plaintext);
    payloads[file.attachmentId] = bytesToBlob(encrypted, "capsule_attachment_payload");
  }
  return payloads;
}

export async function decryptCapsuleAttachmentFiles(
  capsuleKey: Uint8Array,
  attachmentPayloads: Record<string, EncryptedBlobDto> | undefined,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  if (!attachmentPayloads) {
    return files;
  }
  for (const [attachmentId, blob] of Object.entries(attachmentPayloads)) {
    const normalizedAttachmentId = attachmentId.trim();
    if (!normalizedAttachmentId) {
      continue;
    }
    const plaintext = await decryptCapsulePayload(capsuleKey, blobToBytes(blob));
    files.set(normalizedAttachmentId, plaintext);
  }
  return files;
}

export async function openCapsuleItemFileFromVault(input: {
  accessToken: string;
  accountVaultKey: Uint8Array;
  core: CoreClient;
  userId: string | null;
  item: ItemPlaintextV2;
  file: KeyFieldFileValue;
}): Promise<string> {
  const vault = await input.core.getVault(input.item.vaultId);
  const vaultKey = await resolveVaultItemEncryptionKey({
    vault,
    accountVaultKey: input.accountVaultKey,
    core: input.core,
    userId: input.userId,
  });
  return downloadKeyFieldFileAttachment({
    accessToken: input.accessToken,
    vaultId: input.item.vaultId,
    itemId: input.item.itemId,
    vaultKey,
    file: input.file,
  });
}
