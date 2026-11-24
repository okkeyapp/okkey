import {
  clientSideFaviconUrlFromUrls,
  faviconProviderUsesServerPreview,
  parseFaviconProviderMode,
  type FaviconProviderMode,
} from "@okkey/ui/lib/favicon-mode";

const cache = new Map<string, Promise<FaviconProviderMode>>();
const MAX_CLIENT_FAVICON_BYTES = 256 * 1024;

export function resetFaviconProviderModeCache(): void {
  cache.clear();
}

async function readProvider(apiBaseUrl: string): Promise<FaviconProviderMode> {
  try {
    const response = await fetch(`${apiBaseUrl}/favicon/config`);
    if (!response.ok) {
      return "off";
    }
    const body = (await response.json()) as { provider?: unknown };
    return parseFaviconProviderMode(body.provider);
  } catch {
    return "off";
  }
}

/** Cached `GET /favicon/config`. A failure stays `off` so item domains are not posted. */
export function loadFaviconProviderMode(apiBaseUrl: string): Promise<FaviconProviderMode> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const existing = cache.get(base);
  if (existing) {
    return existing;
  }
  const pending = readProvider(base);
  cache.set(base, pending);
  return pending;
}

export function extensionMayRequestServerFavicon(mode: FaviconProviderMode): boolean {
  return faviconProviderUsesServerPreview(mode);
}

function looksLikeFaviconBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) {
    return false;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return true;
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && (bytes[2] === 0x01 || bytes[2] === 0x02) && bytes[3] === 0x00) {
    return true;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * Load `https://<host>/favicon.ico` in the extension (host permission).
 * Does not call the Okkey API and does not follow redirects onto another host.
 */
export async function fetchClientOriginFavicon(urls: readonly string[]): Promise<Uint8Array | null> {
  const src = clientSideFaviconUrlFromUrls(urls);
  if (!src) {
    return null;
  }
  try {
    const response = await fetch(src, { redirect: "manual", credentials: "omit" });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_CLIENT_FAVICON_BYTES) {
      return null;
    }
    if (!looksLikeFaviconBytes(bytes)) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}
