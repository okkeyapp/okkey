import { isKeyFieldFileImageMimeType, type KeyFieldFileValue } from "@okkey/ui";
import { encryptAttachmentPayload } from "@okkey/crypto";
import {
  downloadKeyFieldFileAttachment as downloadKeyFieldFileAttachmentWithBaseUrl,
  downloadKeyFieldFileAttachmentBytes as downloadKeyFieldFileAttachmentBytesWithBaseUrl,
  type DownloadedKeyFieldFileAttachmentBytes,
} from "@okkey/vault";

import { getApiBaseUrl } from "./client";

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function uploadKeyFieldFileAttachment(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<KeyFieldFileValue> {
  const plaintext = new Uint8Array(await input.file.arrayBuffer());
  const uploaded = await uploadEncryptedAttachment({
    accessToken: input.accessToken,
    vaultId: input.vaultId,
    itemId: input.itemId,
    vaultKey: input.vaultKey,
    plaintext,
    name: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
    onProgress: input.onProgress,
  });
  return {
    ...uploaded,
    url: isKeyFieldFileImageMimeType(uploaded.mimeType) ? URL.createObjectURL(input.file) : uploaded.url,
  };
}

export async function uploadEncryptedAttachment(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  plaintext: Uint8Array;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  onProgress?: (percent: number) => void;
}): Promise<KeyFieldFileValue> {
  const encrypted = await encryptAttachmentPayload(input.vaultKey, input.plaintext, {
    vaultId: input.vaultId,
    itemId: input.itemId,
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${getApiBaseUrl()}/vaults/${encodeURIComponent(input.vaultId)}/items/${encodeURIComponent(input.itemId)}/attachments`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Mime-Type", input.mimeType || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(input.name));
    xhr.setRequestHeader("X-File-Size", String(input.sizeBytes ?? input.plaintext.byteLength));
    xhr.setRequestHeader("X-Encrypted-Key", bytesToBase64(encrypted.encryptedKey));

    xhr.upload.onprogress = (event) => {
      if (!input.onProgress || !event.lengthComputable) {
        return;
      }

      input.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const uploaded = JSON.parse(xhr.responseText) as KeyFieldFileValue;
          resolve(uploaded);
          return;
        } catch {
          reject(new Error("Invalid upload response"));
          return;
        }
      }

      reject(new Error(readErrorMessage(xhr.status, xhr.responseText)));
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed"));
    };

    xhr.send(encrypted.encryptedBody);
  });
}

/** Thin wrapper over `@okkey/vault`'s download helper, injecting the web app's resolved API base URL. */
export async function downloadKeyFieldFileAttachment(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: KeyFieldFileValue;
}): Promise<string> {
  return downloadKeyFieldFileAttachmentWithBaseUrl({ apiBaseUrl: getApiBaseUrl(), ...input });
}

export async function downloadKeyFieldFileAttachmentBytes(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: KeyFieldFileValue;
}): Promise<DownloadedKeyFieldFileAttachmentBytes> {
  return downloadKeyFieldFileAttachmentBytesWithBaseUrl({ apiBaseUrl: getApiBaseUrl(), ...input });
}

export async function deleteKeyFieldFileAttachment(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  file: KeyFieldFileValue;
}): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/vaults/${encodeURIComponent(input.vaultId)}/items/${encodeURIComponent(input.itemId)}/attachments/${encodeURIComponent(input.file.attachmentId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const responseText = await response.text();
    throw new Error(readErrorMessage(response.status, responseText));
  }
}
