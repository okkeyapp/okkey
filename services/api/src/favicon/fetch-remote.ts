import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";

const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts used to capture Google's generic “no favicon” placeholder bytes (google provider only). */
const GENERIC_FAVICON_SENTINEL_HOSTS = ["invalid.invalid", "this-domain-does-not-exist.okkey"] as const;

/** Well-known origin-relative paths tried for the default (direct) provider. */
const DIRECT_FAVICON_PATHS = ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] as const;

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5_000;

/** Cap response body size for outbound favicon fetches (bytes). */
export const MAX_FAVICON_RESPONSE_BYTES = 256 * 1024;

export type FaviconProvider = "direct" | "google" | "off";

export type FaviconFetchOptions = {
  /** Default `direct` — fetch from the site origin only. */
  provider?: FaviconProvider;
};

/** Resolves a hostname to one or more IP addresses (A/AAAA). */
export type FaviconHostResolver = (hostname: string) => Promise<string[]>;

export type FaviconPinnedAddress = {
  address: string;
  family: 4 | 6;
};

export type FaviconOutboundResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  readBody: (maxBytes: number) => Promise<Uint8Array | null>;
};

export type FaviconOutboundRequest = (
  url: URL,
  options: {
    signal: AbortSignal;
    pinned: FaviconPinnedAddress;
    headers: Record<string, string>;
  },
) => Promise<FaviconOutboundResponse>;

const DISALLOWED_RESOLVED_ADDRESSES = (() => {
  const list = new net.BlockList();
  // IPv4 special-use / non-global
  list.addSubnet("0.0.0.0", 8, "ipv4");
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("100.64.0.0", 10, "ipv4");
  list.addSubnet("169.254.0.0", 16, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  // RFC 2544 benchmarking range
  list.addSubnet("198.18.0.0", 15, "ipv4");
  // Multicast and reserved
  list.addSubnet("224.0.0.0", 4, "ipv4");
  list.addSubnet("240.0.0.0", 4, "ipv4");
  // IPv6 special-use / non-global
  list.addAddress("::", "ipv6");
  list.addAddress("::1", "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  list.addSubnet("ff00::", 8, "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  // NAT64 well-known prefix and 6to4
  list.addSubnet("64:ff9b::", 96, "ipv6");
  list.addSubnet("2002::", 16, "ipv6");
  return list;
})();

async function defaultResolveHostAddresses(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

function createPinnedLookup(pinned: FaviconPinnedAddress): LookupFunction {
  return ((_hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    if (typeof cb !== "function") {
      throw new Error("favicon lookup callback missing");
    }
    if (typeof options === "object" && options?.all) {
      cb(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    cb(null, pinned.address, pinned.family);
  }) as LookupFunction;
}

async function readResponseBodyLimited(
  response: http.IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const contentLengthHeader = response.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const contentLength = Number(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      response.resume();
      response.destroy();
      return null;
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of response) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > maxBytes) {
        response.destroy();
        return null;
      }
      chunks.push(buf);
    }
  } catch {
    return null;
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function defaultFaviconOutboundRequest(
  url: URL,
  options: {
    signal: AbortSignal;
    pinned: FaviconPinnedAddress;
    headers: Record<string, string>;
  },
): Promise<FaviconOutboundResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const lookup = createPinnedLookup(options.pinned);

  return await new Promise<FaviconOutboundResponse>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          ...options.headers,
          Host: url.host,
        },
        lookup,
        signal: options.signal,
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          readBody: (maxBytes) => readResponseBodyLimited(res, maxBytes),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let hostResolver: FaviconHostResolver = defaultResolveHostAddresses;
let outboundRequest: FaviconOutboundRequest = defaultFaviconOutboundRequest;

/** Test-only: override DNS resolution used before outbound favicon fetches. */
export function setFaviconHostResolverForTests(resolver: FaviconHostResolver | null): void {
  hostResolver = resolver ?? defaultResolveHostAddresses;
}

/** Test-only: override the outbound HTTP(S) request used for favicon fetches. */
export function setFaviconOutboundRequestForTests(request: FaviconOutboundRequest | null): void {
  outboundRequest = request ?? defaultFaviconOutboundRequest;
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
 * (loopback, private, link-local, ULA, unspecified, multicast, benchmarking, NAT64, 6to4).
 */
export function isDisallowedResolvedAddress(address: string): boolean {
  const withoutZone = address.trim().toLowerCase().split("%")[0] ?? "";
  const ip = withoutZone.startsWith("::ffff:") ? withoutZone.slice(7) : withoutZone;
  const family = net.isIP(ip);
  if (family === 0) {
    return true;
  }
  return DISALLOWED_RESOLVED_ADDRESSES.check(ip, family === 6 ? "ipv6" : "ipv4");
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

async function resolvePinnedAddress(hostname: string): Promise<FaviconPinnedAddress | null> {
  try {
    const addresses = await hostResolver(hostname);
    if (addresses.length === 0) {
      return null;
    }
    if (!addresses.every((address) => !isDisallowedResolvedAddress(address))) {
      return null;
    }
    for (const address of addresses) {
      const family = net.isIP(address);
      if (family === 4 || family === 6) {
        return { address, family };
      }
    }
    return null;
  } catch {
    return null;
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

function headerValue(headers: http.IncomingHttpHeaders, name: string): string | null {
  const raw = headers[name];
  if (raw === undefined) {
    return null;
  }
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function redirectLocation(
  status: number,
  headers: http.IncomingHttpHeaders,
  currentUrl: string,
): string | null {
  if (status < 300 || status >= 400) {
    return null;
  }
  const location = headerValue(headers, "location");
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

  const pinned = await resolvePinnedAddress(url.hostname);
  if (!pinned) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await outboundRequest(url, {
      signal: controller.signal,
      pinned,
      headers: {
        Accept: "image/png,image/x-icon,image/vnd.microsoft.icon,image/*,*/*;q=0.8",
      },
    });

    const next = redirectLocation(response.status, response.headers, url.href);
    if (next) {
      // Drain unused redirect body so sockets can close cleanly.
      await response.readBody(MAX_FAVICON_RESPONSE_BYTES).catch(() => null);
      return fetchImageBytes(next, redirectCount + 1);
    }

    if (response.status < 200 || response.status >= 300) {
      await response.readBody(MAX_FAVICON_RESPONSE_BYTES).catch(() => null);
      return null;
    }

    const contentType = (headerValue(response.headers, "content-type") ?? "").toLowerCase();
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      await response.readBody(MAX_FAVICON_RESPONSE_BYTES).catch(() => null);
      return null;
    }

    const bytes = await response.readBody(MAX_FAVICON_RESPONSE_BYTES);
    if (!bytes || bytes.byteLength === 0 || !looksLikeImageBytes(bytes)) {
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
