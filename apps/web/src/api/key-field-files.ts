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
  const encrypted = await encryptAttachmentPayload(input.vaultKey, plaintext, {
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
    xhr.setRequestHeader("X-File-Mime-Type", input.file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(input.file.name));
    xhr.setRequestHeader("X-File-Size", String(input.file.size));
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
          resolve({
            ...uploaded,
            url: isKeyFieldFileImageMimeType(uploaded.mimeType)
              ? URL.createObjectURL(input.file)
              : uploaded.url,
          });
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
  const blob = new Blob([plaintext], { type: input.file.mimeType || "application/octet-stream" });
  return URL.createObjectURL(blob);
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
