/**
 * How website icons are resolved.
 * - `off` (private default): monogram only; no remote lookup.
 * - `direct`: the Okkey API fetches the icon from the site (admin opt-in).
 * - `google`: the Okkey API asks Google's favicon service (admin opt-in).
 * - `client`: the browser or extension loads `https://<host>/favicon.ico` itself.
 *   The Okkey API is not told the domain. The site and DNS still see the lookup.
 */
export const FAVICON_PROVIDER_MODES = ["off", "direct", "google", "client"] as const;

export type FaviconProviderMode = (typeof FAVICON_PROVIDER_MODES)[number];

export function parseFaviconProviderMode(raw: unknown): FaviconProviderMode {
  if (typeof raw !== "string") {
    return "off";
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "direct" ||
    normalized === "google" ||
    normalized === "client"
  ) {
    return normalized;
  }
  return "off";
}

/** True only when the client may POST domains to `POST /favicon/preview`. */
export function faviconProviderUsesServerPreview(mode: FaviconProviderMode): boolean {
  return mode === "direct" || mode === "google";
}

export type WebsiteIconDisplay =
  | { kind: "monogram" }
  | { kind: "server" }
  | { kind: "client"; src: string };

/**
 * What to render for a login that has no stored icon.
 * `client` points at the site origin only (`https://<host>/favicon.ico`), never at the Okkey API.
 */
export function resolveWebsiteIconDisplay(
  mode: FaviconProviderMode,
  urls: readonly string[],
): WebsiteIconDisplay {
  if (faviconProviderUsesServerPreview(mode)) {
    return { kind: "server" };
  }
  if (mode === "client") {
    const src = clientSideFaviconUrlFromUrls(urls);
    return src ? { kind: "client", src } : { kind: "monogram" };
  }
  return { kind: "monogram" };
}

const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Same public-host filter as `urlsForRemoteFavicon` (no localhost, IPs, or single-label names). */
function publicSiteHost(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  let host = "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    host = url.hostname.replace(/^www\./i, "");
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
      host = trimmed.replace(/^www\./i, "");
    }
  }
  if (!host) {
    return null;
  }
  const normalized = host.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized.includes(":") ||
    IPV4_HOST_RE.test(normalized) ||
    !normalized.includes(".")
  ) {
    return null;
  }
  return normalized;
}

/** `https://<host>/favicon.ico` for one website URL, or null when the host is not a public site. */
export function clientSideFaviconUrl(rawUrl: string): string | null {
  const host = publicSiteHost(rawUrl);
  if (!host) {
    return null;
  }
  return `https://${host}/favicon.ico`;
}

/** First suitable website URL, as an origin favicon the client can load without the Okkey API. */
export function clientSideFaviconUrlFromUrls(urls: readonly string[]): string | null {
  for (const url of urls) {
    const src = clientSideFaviconUrl(url);
    if (src) {
      return src;
    }
  }
  return null;
}
