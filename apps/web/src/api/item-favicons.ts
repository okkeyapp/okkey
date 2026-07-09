import { getApiBaseUrl } from "./client";

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
