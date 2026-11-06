import { createHash } from "node:crypto";

import { SystemUpdateError } from "./errors.ts";
import {
  assertHttpUrl,
  parseUpdateFeed,
  type SignedOfflinePackage,
  type UpdateFeedDocument,
} from "./package-format.ts";

export type FeedFetch = (url: string, init: RequestInit) => Promise<Response>;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_000_000;

/**
 * Decide whether a feed URL may be contacted.
 * An empty URL or isolated mode never calls out. There is no built-in host.
 */
export function feedRequestUrl(feedUrl: string, isolated: boolean): string | null {
  const trimmed = feedUrl.trim();
  if (isolated || trimmed === "") {
    return null;
  }
  return assertHttpUrl(trimmed).toString();
}

export async function fetchUpdateFeed(
  feedUrl: string,
  isolated: boolean,
  fetchImpl: FeedFetch,
): Promise<UpdateFeedDocument | null> {
  const url = feedRequestUrl(feedUrl, isolated);
  if (!url) {
    return null;
  }
  const body = await fetchText(url, fetchImpl);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SystemUpdateError(502, "FEED_INVALID", "Update feed was not valid JSON");
  }
  return parseUpdateFeed(parsed);
}

export async function downloadSignedPackage(
  packageUrl: string,
  expectedSha256: string,
  fetchImpl: FeedFetch,
): Promise<SignedOfflinePackage> {
  const url = assertHttpUrl(packageUrl).toString();
  const body = await fetchText(url, fetchImpl);
  const actual = createHash("sha256").update(body).digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    throw new SystemUpdateError(
      400,
      "PACKAGE_INVALID",
      "Downloaded package does not match the feed checksum",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Downloaded package was not valid JSON");
  }
  return parsed as SignedOfflinePackage;
}

async function fetchText(url: string, fetchImpl: FeedFetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "User-Agent": "okkey-update-feed",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new SystemUpdateError(502, "FEED_FETCH_FAILED", `Update source could not be reached (${message})`);
  }
  if (!response.ok) {
    throw new SystemUpdateError(
      502,
      "FEED_FETCH_FAILED",
      `Update source returned HTTP ${response.status}`,
    );
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_BYTES) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Update document exceeds the size limit");
  }
  return text;
}
