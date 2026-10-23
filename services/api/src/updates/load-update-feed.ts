import { readFile } from "node:fs/promises";

import {
  parseUpdateFeedDocument,
  type UpdateFeedDocument,
} from "./feed-contract.ts";

export type UpdateFeedSource = {
  /** HTTPS/HTTP feed URL (optional). */
  url: string;
  /** Local JSON file path inside the perimeter (optional). */
  path: string;
  /** Fetch timeout for URL feeds. */
  timeoutMs: number;
};

export function isUpdateFeedConfigured(source: UpdateFeedSource): boolean {
  return source.url.trim() !== "" || source.path.trim() !== "";
}

/**
 * Load feed from path (preferred when set) or URL.
 * Path-first supports isolated / perimeter installs without outbound calls.
 */
export async function loadUpdateFeedDocument(
  source: UpdateFeedSource,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateFeedDocument> {
  const path = source.path.trim();
  if (path) {
    const rawText = await readFile(path, "utf8");
    return parseUpdateFeedDocument(JSON.parse(rawText) as unknown);
  }

  const url = source.url.trim();
  if (!url) {
    throw new Error("UPDATE_FEED_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), source.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`UPDATE_FEED_HTTP_${response.status}`);
    }
    return parseUpdateFeedDocument((await response.json()) as unknown);
  } finally {
    clearTimeout(timer);
  }
}
