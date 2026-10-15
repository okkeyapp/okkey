import dns from "node:dns/promises";
import net from "node:net";

const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts used to capture Google's generic “no favicon” placeholder bytes (google provider only). */
const GENERIC_FAVICON_SENTINEL_HOSTS = ["invalid.invalid", "this-domain-does-not-exist.okkey"] as const;

/** Well-known origin-relative paths tried for the default (direct) provider. */
const DIRECT_FAVICON_PATHS = ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] as const;

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5_000;

export type FaviconProvider = "direct" | "google" | "off";

export type FaviconFetchOptions = {
  /** Default `direct` — fetch from the site origin only. */
  provider?: FaviconProvider;
};

/** Resolves a hostname to one or more IP addresses (A/AAAA). */
export type FaviconHostResolver = (hostname: string) => Promise<string[]>;

async function defaultResolveHostAddresses(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

let hostResolver: FaviconHostResolver = defaultResolveHostAddresses;

/** Test-only: override DNS resolution used before outbound favicon fetches. */
export function setFaviconHostResolverForTests(resolver: FaviconHostResolver | null): void {
  hostResolver = resolver ?? defaultResolveHostAddresses;
}

export function parseHostFromUrl(input: string): string | null {
  const t = input.trim();
  if (!t) {
    return null;
  }
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    const host = u.hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) {
      return t.replace(/^www\./i, "").toLowerCase();
    }
    return null;
  }
}

function stripIpv6Brackets(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}

function isIpv4Host(host: string): boolean {
  return IPV4_HOST_RE.test(host);
}

/** Hostname string checks before DNS (literals, localhost-like names). */
export function isHostSuitableForFaviconLookup(host: string): boolean {
  const normalized = stripIpv6Brackets(host).toLowerCase();
  if (!normalized) {
    return false;
  }
  if (net.isIP(normalized) !== 0 || isIpv4Host(normalized)) {
    return false;
  }
  if (
    normalized === "localhost" ||
    normalized === "localhost.localdomain" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return false;
  }
  return normalized.includes(".");
}

/**
 * True when a resolved address must not be contacted for favicon fetch
 * (loopback, private, link-local, ULA, unspecified, multicast).
 */
export function isDisallowedResolvedAddress(address: string): boolean {
  const withoutZone = address.trim().toLowerCase().split("%")[0] ?? "";
  const ip = withoutZone.startsWith("::ffff:") ? withoutZone.slice(7) : withoutZone;
  const family = net.isIP(ip);
  if (family === 0) {
    return true;
  }

  if (family === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ip === "::" || ip === "::1" || ip === "0:0:0:0:0:0:0:0" || ip === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const firstHextet = ip.split(":", 1)[0] ?? "";
  const firstValue = Number.parseInt(firstHextet || "0", 16);
  if (!Number.isFinite(firstValue)) {
    return true;
  }
  // fe80::/10 link-local, ff00::/8 multicast, fc00::/7 unique local (ULA)
  if ((firstValue & 0xffc0) === 0xfe80 || (firstValue & 0xff00) === 0xff00 || (firstValue & 0xfe00) === 0xfc00) {
    return true;
  }

  return false;
}

export function isAllowedFaviconFetchUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  if (url.username || url.password) {
    return false;
  }
  const port = url.port;
  if (port !== "" && port !== "80" && port !== "443") {
    return false;
  }
  return isHostSuitableForFaviconLookup(url.hostname);
}

async function hostResolvesToAllowedAddresses(hostname: string): Promise<boolean> {
  try {
    const addresses = await hostResolver(hostname);
    if (addresses.length === 0) {
      return false;
    }
    return addresses.every((address) => !isDisallowedResolvedAddress(address));
  } catch {
    return false;
  }
}

/** Suitable hosts in URL list order (first match per URL). */
export function hostsFromUrls(urls: readonly string[]): string[] {
  const out: string[] = [];
  for (const url of urls) {
    const host = parseHostFromUrl(url);
    if (host && isHostSuitableForFaviconLookup(host)) {
      out.push(host);
    }
  }
  return out;
}

/** @deprecated Use {@link hostsFromUrls} + {@link fetchRemoteFaviconBytesFromUrls}. */
export function primaryHostFromUrls(urls: readonly string[]): string | null {
  return hostsFromUrls(urls)[0] ?? null;
}

export function parseFaviconProvider(raw: string | undefined): FaviconProvider {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized || normalized === "direct") {
    return "direct";
  }
  if (normalized === "google" || normalized === "off") {
    return normalized;
  }
  throw new Error(`FAVICON_PROVIDER must be "direct", "google", or "off", got: ${raw}`);
}

function buildGoogleFaviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function buildDirectFaviconUrls(host: string): string[] {
  return DIRECT_FAVICON_PATHS.map((path) => `https://${host}${path}`);
}

/** True when bytes look like a common raster/icon image (not HTML/error pages). */
export function looksLikeImageBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) {
    return false;
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return true;
  }
  // ICO / CUR
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && (bytes[2] === 0x01 || bytes[2] === 0x02) && bytes[3] === 0x00) {
    return true;
  }
  // WEBP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function redirectLocation(response: Response, currentUrl: string): string | null {
  if (response.status < 300 || response.status >= 400) {
    return null;
  }
  const location = response.headers.get("location");
  if (!location) {
    return null;
  }
  try {
    return new URL(location, currentUrl).href;
  } catch {
    return null;
  }
}

async function fetchImageBytes(urlString: string, redirectCount = 0): Promise<Uint8Array | null> {
  if (redirectCount > MAX_REDIRECTS) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (!isAllowedFaviconFetchUrl(url)) {
    return null;
  }
  if (!(await hostResolvesToAllowedAddresses(url.hostname))) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      redirect: "manual",
      headers: { Accept: "image/png,image/x-icon,image/vnd.microsoft.icon,image/*,*/*;q=0.8" },
    });

    const next = redirectLocation(response, url.href);
    if (next) {
      return fetchImageBytes(next, redirectCount + 1);
    }

    if (!response.ok) {
      return null;
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || !looksLikeImageBytes(bytes)) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

let genericFaviconSignatures: Uint8Array[] | undefined;

async function loadGenericFaviconSignatures(): Promise<Uint8Array[]> {
  if (genericFaviconSignatures) {
    return genericFaviconSignatures;
  }

  const signatures: Uint8Array[] = [];
  const seen = new Set<string>();

  for (const host of GENERIC_FAVICON_SENTINEL_HOSTS) {
    const bytes = await fetchImageBytes(buildGoogleFaviconUrl(host));
    if (!bytes) {
      continue;
    }
    const key = `${bytes.byteLength}:${bytes[0] ?? 0}:${bytes[bytes.byteLength - 1] ?? 0}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    signatures.push(bytes);
  }

  genericFaviconSignatures = signatures;
  return signatures;
}

/** Test-only: clears cached Google placeholder signatures. */
export function resetGenericFaviconSignatureCache(): void {
  genericFaviconSignatures = undefined;
}

/** True when Google returned its generic globe / empty placeholder instead of a site icon. */
export async function isGenericOrEmptyFavicon(bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength < 48) {
    return true;
  }

  const signatures = await loadGenericFaviconSignatures();
  return signatures.some((signature) => bytesEqual(bytes, signature));
}

async function fetchDirectFaviconBytes(host: string): Promise<Uint8Array | null> {
  for (const url of buildDirectFaviconUrls(host)) {
    const bytes = await fetchImageBytes(url);
    if (bytes && bytes.byteLength >= 48) {
      return bytes;
    }
  }
  return null;
}

async function fetchGoogleFaviconBytes(host: string): Promise<Uint8Array | null> {
  const bytes = await fetchImageBytes(buildGoogleFaviconUrl(host));
  if (!bytes) {
    return null;
  }
  if (await isGenericOrEmptyFavicon(bytes)) {
    return null;
  }
  return bytes;
}

export async function fetchRemoteFaviconBytes(
  host: string,
  options: FaviconFetchOptions = {},
): Promise<Uint8Array | null> {
  const provider = options.provider ?? "direct";
  if (provider === "off") {
    return null;
  }

  const normalized = host.trim().toLowerCase().replace(/^www\./i, "");
  if (!normalized || !isHostSuitableForFaviconLookup(normalized)) {
    return null;
  }

  if (provider === "google") {
    return fetchGoogleFaviconBytes(normalized);
  }

  return fetchDirectFaviconBytes(normalized);
}

/**
 * Walk URLs in list order; return bytes for the first host whose favicon is not generic/empty.
 */
export async function fetchRemoteFaviconBytesFromUrls(
  urls: readonly string[],
  options: FaviconFetchOptions = {},
): Promise<Uint8Array | null> {
  const provider = options.provider ?? "direct";
  if (provider === "off") {
    return null;
  }

  const hosts = hostsFromUrls(urls);
  for (const host of hosts) {
    const bytes = await fetchRemoteFaviconBytes(host, options);
    if (bytes) {
      return bytes;
    }
  }
  return null;
}
