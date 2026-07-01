import type { ItemFaviconUpsertResponseDto } from "@okkey/types";

import { getApiBaseUrl } from "./client";

export function buildItemFaviconUrl(faviconId: string): string {
  return `${getApiBaseUrl()}/favicons/${encodeURIComponent(faviconId)}`;
}

async function readErrorMessage(status: number, responseText: string): Promise<string> {
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

export async function previewItemFavicon(
  accessToken: string,
  urls: readonly string[],
): Promise<Blob | null> {
  const response = await fetch(`${getApiBaseUrl()}/favicon/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls: [...urls] }),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(await readErrorMessage(response.status, text));
  }

  return response.blob();
}

export async function upsertItemFavicon(
  accessToken: string,
  vaultId: string,
  itemId: string,
  urls: readonly string[],
): Promise<ItemFaviconUpsertResponseDto> {
  const response = await fetch(
    `${getApiBaseUrl()}/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}/favicon`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: [...urls] }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(await readErrorMessage(response.status, text));
  }
  return JSON.parse(text) as ItemFaviconUpsertResponseDto;
}

export async function clearItemFavicon(
  accessToken: string,
  vaultId: string,
  itemId: string,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}/favicon`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(await readErrorMessage(response.status, text));
  }
}
