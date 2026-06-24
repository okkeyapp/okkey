import type { KeyFieldFileValue } from "@okkey/ui";

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

export async function uploadDevKeyFieldFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<KeyFieldFileValue> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiBaseUrl()}/dev/key-field-files`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }

      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as KeyFieldFileValue);
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

    xhr.send(file);
  });
}

export async function deleteDevKeyFieldFile(file: KeyFieldFileValue): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/dev/key-field-files/${encodeURIComponent(file.attachmentId)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    try {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload.message ?? `Request failed (${response.status})`);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Request failed (${response.status})`);
    }
  }
}
