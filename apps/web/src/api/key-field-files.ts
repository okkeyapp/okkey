import { isKeyFieldFileImageMimeType, type KeyFieldFileValue } from "@okkey/ui";
import { decryptAttachmentPayload, encryptAttachmentPayload } from "@okkey/crypto";

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

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

export async function downloadKeyFieldFileAttachment(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: KeyFieldFileValue;
}): Promise<string> {
  const downloaded = await downloadKeyFieldFileAttachmentBytes(input);
  const blob = new Blob([downloaded.plaintext], { type: downloaded.mimeType });
  return URL.createObjectURL(blob);
}

export async function downloadKeyFieldFileAttachmentBytes(input: {
  accessToken: string;
  vaultId: string;
  itemId: string;
  vaultKey: Uint8Array;
  file: KeyFieldFileValue;
}): Promise<{ plaintext: Uint8Array; name: string; mimeType: string; sizeBytes: number }> {
  const response = await fetch(
    `${getApiBaseUrl()}/vaults/${encodeURIComponent(input.vaultId)}/items/${encodeURIComponent(input.itemId)}/attachments/${encodeURIComponent(input.file.attachmentId)}`,
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
