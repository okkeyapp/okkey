import {
  ITEM_CATEGORY_LOGIN,
  type ItemPlaintextV2,
  type UrlAutofillScope,
} from "@okkey/types";

/** Explicit default ports. `URL.origin` omits them; comparisons here always include them. */
export const HTTP_DEFAULT_PORT = 80;
export const HTTPS_DEFAULT_PORT = 443;

/**
 * Canonical origin for HTTP basic-auth matching: `scheme://host:port`.
 * Default ports are written explicitly (80 for http, 443 for https).
 * Path, query, hash, and userinfo are dropped. Host is lowercased.
 * Returns null unless the URL is already http or https (no scheme is not assumed).
 */
export function canonicalHttpOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return null;
  }
  const rawHost = url.hostname.toLowerCase();
  const bareHost =
    rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  if (!bareHost) {
    return null;
  }
  const scheme = protocol === "http:" ? "http" : "https";
  const defaultPort = scheme === "http" ? HTTP_DEFAULT_PORT : HTTPS_DEFAULT_PORT;
  const parsedPort = url.port === "" ? defaultPort : Number(url.port);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    return null;
  }
  const host = bareHost.includes(":") ? `[${bareHost}]` : bareHost;
  return `${scheme}://${host}:${parsedPort}`;
}

export function httpOriginsEqual(a: string, b: string): boolean {
  const left = canonicalHttpOrigin(a);
  const right = canonicalHttpOrigin(b);
  return left !== null && left === right;
}

export function httpOriginIsInsecure(origin: string): boolean {
  return origin.startsWith("http://");
}

/** Display form omits the explicit default port (80 / 443) the canonical form keeps. */
export function formatHttpOriginForDisplay(raw: string): string | null {
  const canonical = canonicalHttpOrigin(raw);
  if (!canonical) {
    return null;
  }
  const match = /^(https?):\/\/(\[[^\]]+\]|[^:]+):(\d+)$/.exec(canonical);
  if (!match) {
    return canonical;
  }
  const scheme = match[1] === "http" ? "http" : "https";
  const host = match[2] ?? "";
  const port = Number(match[3]);
  const defaultPort = scheme === "http" ? HTTP_DEFAULT_PORT : HTTPS_DEFAULT_PORT;
  if (port === defaultPort) {
    return `${scheme}://${host}`;
  }
  return `${scheme}://${host}:${port}`;
}

function scopeAllowsHttpAuth(scope: UrlAutofillScope | undefined): boolean {
  return scope !== "none";
}

/**
 * Exact origin match against login URL fields.
 * `entire-site` does not widen the host. `exact-url` does not require the same path.
 * `none` never matches. This is not form-autofill matching.
 */
export function loginItemMatchesHttpAuthOrigin(item: ItemPlaintextV2, challengeUrl: string): boolean {
  if (item.categoryId !== ITEM_CATEGORY_LOGIN || item.deleted || item.archived) {
    return false;
  }
  const challengeOrigin = canonicalHttpOrigin(challengeUrl);
  if (!challengeOrigin) {
    return false;
  }
  for (const field of item.fields) {
    if (field.type !== "url" || field.value.kind !== "url") {
      continue;
    }
    if (!scopeAllowsHttpAuth(field.value.urlAutofillScope)) {
      continue;
    }
    const fieldOrigin = canonicalHttpOrigin(field.value.url);
    if (fieldOrigin !== null && fieldOrigin === challengeOrigin) {
      return true;
    }
  }
  return false;
}
