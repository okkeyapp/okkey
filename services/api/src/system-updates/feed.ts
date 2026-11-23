import { createHash } from "node:crypto";

import { SystemUpdateError } from "./errors.ts";
import { BUNDLE_MAX_DOCUMENT_BYTES } from "./offline-bundle.ts";
import {
  assertHttpUrl,
  parseUpdateFeed,
  type SignedOfflinePackage,
  type UpdateFeedDocument,
} from "./package-format.ts";

export type FeedFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Whether the request loads a feed document or a signed package body. */
export type FetchPurpose = "feed" | "package";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = BUNDLE_MAX_DOCUMENT_BYTES;
const MAX_REDIRECTS = 3;

/**
 * Hosts on the GitHub Release asset redirect chain.
 * `releases/latest/download/<file>` returns 302 to the tag download URL, which
 * returns 302 to a release asset host. Listed without a scheme so this module
 * does not embed a feed address. Used only when no license header is attached.
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
  const body = await fetchText(url, fetchImpl, headers, "feed");
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
  headers?: Record<string, string>,
): Promise<SignedOfflinePackage> {
  const url = assertHttpUrl(packageUrl).toString();
  const body = await fetchText(url, fetchImpl, headers, "package");
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

function hasAuthHeaders(headers?: Record<string, string>): boolean {
  return Boolean(headers && Object.keys(headers).length > 0);
}

/**
 * Attach auth headers only when the request URL is still on the original origin.
 * Never forward a license key to a different host, even after a redirect chain.
 */
export function headersForSameOriginRequest(
  requestUrl: string,
  originalOrigin: string,
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!hasAuthHeaders(headers)) {
    return undefined;
  }
  let requestOrigin: string;
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    return undefined;
  }
  if (requestOrigin !== originalOrigin) {
    return undefined;
  }
  return headers;
}

function isHttpsToHttpDowngrade(current: URL, next: URL): boolean {
  return current.protocol === "https:" && next.protocol !== "https:";
}

/**
 * Redirects without a license header may stay on the same origin or follow the
 * GitHub release-asset chain. Auth-bearing requests use exact same-origin only.
 */
function allowedUnauthenticatedRedirect(current: URL, next: URL): boolean {
  if (next.protocol !== "http:" && next.protocol !== "https:") {
    return false;
  }
  if (next.username || next.password) {
    return false;
  }
  if (isHttpsToHttpDowngrade(current, next)) {
    return false;
  }
  if (next.origin === current.origin) {
    return true;
  }
  return (
    GITHUB_RELEASE_ASSET_HOSTS.has(current.hostname) &&
    GITHUB_RELEASE_ASSET_HOSTS.has(next.hostname)
  );
}

function redirectForbiddenError(purpose: FetchPurpose): SystemUpdateError {
  if (purpose === "package") {
    return new SystemUpdateError(
      502,
      "PACKAGE_REDIRECT_FORBIDDEN",
      "Package download redirect was not allowed",
    );
  }
  return new SystemUpdateError(502, "FEED_REDIRECT_FORBIDDEN", "Update feed redirect was not allowed");
}

function tooManyRedirectsError(purpose: FetchPurpose): SystemUpdateError {
  if (purpose === "package") {
    return new SystemUpdateError(
      502,
      "PACKAGE_TOO_MANY_REDIRECTS",
      "Package download exceeded the redirect limit",
    );
  }
  return new SystemUpdateError(
    502,
    "FEED_TOO_MANY_REDIRECTS",
    "Update feed exceeded the redirect limit",
  );
}

function fetchFailedError(purpose: FetchPurpose, detail: string): SystemUpdateError {
  if (purpose === "package") {
    return new SystemUpdateError(
      502,
      "PACKAGE_DOWNLOAD_FAILED",
      `Package download failed (${detail})`,
    );
  }
  return new SystemUpdateError(502, "FEED_FETCH_FAILED", `Update source could not be reached (${detail})`);
}

function httpStatusError(purpose: FetchPurpose, status: number): SystemUpdateError {
  if (purpose === "package") {
    return new SystemUpdateError(
      502,
      "PACKAGE_DOWNLOAD_FAILED",
      `Package host returned HTTP ${status}`,
    );
  }
  if (status === 401 || status === 403) {
    return new SystemUpdateError(
      502,
      "FEED_UNAUTHORIZED",
      `Update feed returned HTTP ${status}`,
    );
  }
  return new SystemUpdateError(502, "FEED_FETCH_FAILED", `Update source returned HTTP ${status}`);
}

async function fetchText(
  url: string,
  fetchImpl: FeedFetch,
  headers: Record<string, string> | undefined,
  purpose: FetchPurpose,
): Promise<string> {
  let original: URL;
  try {
    original = new URL(url);
  } catch {
    throw redirectForbiddenError(purpose);
  }
  const authAttached = hasAuthHeaders(headers);
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const requestHeaders = headersForSameOriginRequest(current, original.origin, headers);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "User-Agent": "okkey-update-feed",
          ...requestHeaders,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw fetchFailedError(purpose, message);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (hop === MAX_REDIRECTS) {
        throw tooManyRedirectsError(purpose);
      }
      if (!location) {
        throw redirectForbiddenError(purpose);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw redirectForbiddenError(purpose);
      }
      let currentUrl: URL;
      try {
        currentUrl = new URL(current);
      } catch {
        throw redirectForbiddenError(purpose);
      }
      if (next.username || next.password) {
        throw redirectForbiddenError(purpose);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw redirectForbiddenError(purpose);
      }
      if (isHttpsToHttpDowngrade(currentUrl, next)) {
        throw redirectForbiddenError(purpose);
      }
      if (authAttached) {
        // Fail closed: with a license key, only exact same-origin hops are allowed.
        if (next.origin !== original.origin) {
          throw redirectForbiddenError(purpose);
        }
      } else if (!allowedUnauthenticatedRedirect(currentUrl, next)) {
        throw redirectForbiddenError(purpose);
      }
      current = next.toString();
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      if (purpose === "feed" && response.status === 403 && isLicenseExpiredBody(text)) {
        throw new SystemUpdateError(403, "LICENSE_EXPIRED", "The enterprise license has expired.");
      }
      throw httpStatusError(purpose, response.status);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES) {
      throw new SystemUpdateError(400, "PACKAGE_TOO_LARGE", "Update document exceeds the size limit");
    }
    return text;
  }
  throw tooManyRedirectsError(purpose);
}
