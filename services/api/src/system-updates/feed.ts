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
const MAX_REDIRECTS = 3;

/**
 * Hosts on the GitHub Release asset redirect chain.
 * `releases/latest/download/<file>` returns 302 to the tag download URL, which
 * returns 302 to a release asset host. Listed without a scheme so this module
 * does not embed a feed address.
 */
const GITHUB_RELEASE_ASSET_HOSTS = new Set([
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);

/**
 * Decide whether a feed URL may be contacted.
 * An empty URL or isolated mode never calls out. The default core feed URL is
 * chosen by config before this function runs.
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
  headers?: Record<string, string>,
): Promise<UpdateFeedDocument | null> {
  const url = feedRequestUrl(feedUrl, isolated);
  if (!url) {
    return null;
  }
  const body = await fetchText(url, fetchImpl, headers);
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

function isLicenseExpiredBody(text: string): boolean {
  if (Buffer.byteLength(text) > 256) {
    return false;
  }
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return parsed.error === "LICENSE_EXPIRED";
  } catch {
    return false;
  }
}

function allowedRedirectTarget(current: URL, next: URL): boolean {
  if (next.protocol !== "http:" && next.protocol !== "https:") {
    return false;
  }
  if (next.username || next.password) {
    return false;
  }
  if (current.protocol === "https:" && next.protocol !== "https:") {
    return false;
  }
  if (next.hostname === current.hostname) {
    return true;
  }
  return (
    GITHUB_RELEASE_ASSET_HOSTS.has(current.hostname) &&
    GITHUB_RELEASE_ASSET_HOSTS.has(next.hostname)
  );
}

async function fetchText(
  url: string,
  fetchImpl: FeedFetch,
  headers?: Record<string, string>,
): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "User-Agent": "okkey-update-feed",
          ...headers,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new SystemUpdateError(
        502,
        "FEED_FETCH_FAILED",
        `Update source could not be reached (${message})`,
      );
    }
    if (response.status >= 300 && response.status < 400) {
      if (headers && Object.keys(headers).length > 0) {
        await response.body?.cancel().catch(() => undefined);
        throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
      }
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) {
        throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
      }
      let currentUrl: URL;
      try {
        currentUrl = new URL(current);
      } catch {
        throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
      }
      if (!allowedRedirectTarget(currentUrl, next)) {
        throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
      }
      current = next.toString();
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 403 && isLicenseExpiredBody(text)) {
        throw new SystemUpdateError(403, "LICENSE_EXPIRED", "The enterprise license has expired.");
      }
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
  throw new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source redirect was not allowed");
}
