import { decryptAttachmentPayload } from "@okkey/crypto";
import { isKeyFieldFileImageMimeType, resolveKeyFieldFileMimeType, type KeyFieldFileValue } from "@okkey/ui";

import { base64ToBytes } from "./base64.js";

function readErrorMessage(status: number, responseText: string): string {
  try {
    const payload = JSON.parse(responseText) as { message?: string };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    /* ignore */
  }

  return `Request failed (${status})`;
}

export type DownloadKeyFieldFileAttachmentBytesInput = {
  apiBaseUrl: string;
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: KeyFieldFileValue;
};

export type DownloadedKeyFieldFileAttachmentBytes = {
  plaintext: Uint8Array;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

export async function downloadKeyFieldFileAttachmentBytes(
  input: DownloadKeyFieldFileAttachmentBytesInput,
): Promise<DownloadedKeyFieldFileAttachmentBytes> {
  const response = await fetch(
    `${input.apiBaseUrl}/vaults/${encodeURIComponent(input.vaultId)}/items/${encodeURIComponent(input.itemId)}/attachments/${encodeURIComponent(input.file.attachmentId)}`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(readErrorMessage(response.status, responseText));
  }

  const encryptedKeyHeader = response.headers.get("x-encrypted-key");
  if (!encryptedKeyHeader) {
    throw new Error("Invalid attachment response");
  }

  const encryptedBody = new Uint8Array(await response.arrayBuffer());
  const plaintext = await decryptAttachmentPayload(
    input.vaultKey,
    base64ToBytes(encryptedKeyHeader),
    encryptedBody,
    {
      vaultId: input.vaultId,
      itemId: input.itemId,
    },
  );
  return {
    plaintext,
    name: input.file.name,
    mimeType: input.file.mimeType || "application/octet-stream",
    sizeBytes: plaintext.byteLength,
  };
}

export type DownloadKeyFieldFileAttachmentInput = DownloadKeyFieldFileAttachmentBytesInput;

/** Downloads and decrypts an attachment, returning an object URL for display/consumption. */
export async function downloadKeyFieldFileAttachment(
  input: DownloadKeyFieldFileAttachmentInput,
): Promise<string> {
  const downloaded = await downloadKeyFieldFileAttachmentBytes(input);
  const blob = new Blob([downloaded.plaintext as unknown as BlobPart], {
    type: resolveKeyFieldFileMimeType(downloaded.name, downloaded.mimeType),
  });
  return URL.createObjectURL(blob);
}

/** True when the attachment's MIME type should be rendered as an inline image preview. */
export function keyFieldFileAttachmentIsImage(mimeType: string): boolean {
  return isKeyFieldFileImageMimeType(mimeType);
}

const FAVICON_ATTACHMENT_NAME = "favicon.png";
const FAVICON_ATTACHMENT_MIME_TYPE = "image/png";

/** Builds the minimal `KeyFieldFileValue` needed to download a favicon attachment by id. */
export function keyFieldFileValueFromFaviconId(faviconId: string): KeyFieldFileValue {
  return {
    attachmentId: faviconId,
    name: FAVICON_ATTACHMENT_NAME,
    mimeType: FAVICON_ATTACHMENT_MIME_TYPE,
    sizeBytes: 0,
  };
}
