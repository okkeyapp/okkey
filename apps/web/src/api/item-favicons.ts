import { getApiBaseUrl } from "./client";

export class FaviconPreviewUnavailableError extends Error {
  readonly code = "FAVICON_UNAVAILABLE" as const;

  constructor(message = "Website unreachable; favicon temporarily unavailable") {
    super(message);
    this.name = "FaviconPreviewUnavailableError";
  }
}

async function readErrorMessage(status: number, responseText: string): Promise<string> {
  try {
    const payload = JSON.parse(responseText) as { message?: string; error?: string };
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    /* ignore */
  }
  return `Request failed (${status})`;
}

/**
 * POST /favicon/preview
 * - 200 → image blob
 * - 404 → site reachable, no favicon (`null`)
 * - 503 FAVICON_UNAVAILABLE → site unreachable (throws {@link FaviconPreviewUnavailableError})
 * - other errors → throw
 */
export async function previewItemFavicon(
  accessToken: string,
  urls: readonly string[],
  options?: { signal?: AbortSignal },
): Promise<Blob | null> {
  const response = await fetch(`${getApiBaseUrl()}/favicon/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls: [...urls] }),
    signal: options?.signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (response.status === 503) {
    const text = await response.text();
    throw new FaviconPreviewUnavailableError(await readErrorMessage(response.status, text));
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(await readErrorMessage(response.status, text));
  }

  // Prefer arrayBuffer → Blob so callers can always read bytes (jsdom's response.blob()
  // may lack arrayBuffer()).
  const bytes = await response.arrayBuffer();
  return new Blob([bytes], {
    type: response.headers.get("content-type") || "image/png",
  });
}
