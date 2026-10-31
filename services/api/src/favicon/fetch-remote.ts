import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";
import { parse as parsePublicSuffix } from "tldts";

const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts used to capture Google's generic “no favicon” placeholder bytes (google provider only). */
const GENERIC_FAVICON_SENTINEL_HOSTS = ["invalid.invalid", "this-domain-does-not-exist.okkey"] as const;

/** Well-known origin-relative paths tried for the default (direct) provider. */
const DIRECT_FAVICON_PATHS = ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] as const;

/** Browser-like UA so sites (and Cloudflare) are less likely to challenge favicon/HTML probes. */
const FAVICON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5_000;

/** Cap response body size for outbound favicon fetches (bytes). */
export const MAX_FAVICON_RESPONSE_BYTES = 256 * 1024;

/** Cap HTML page bodies used only to discover `<link rel=icon>` candidates. */
export const MAX_FAVICON_HTML_BYTES = 512 * 1024;

export type FaviconProvider = "direct" | "google" | "off";

export type FaviconFetchOptions = {
  /** Default `direct` — fetch from the site origin only. */
  provider?: FaviconProvider;
};

/**
 * Outcome of a remote favicon lookup.
 * - `found`: usable icon bytes
 * - `absent`: site was reachable but no icon (clients may clear a previous favicon)
 * - `unavailable`: DNS / connection refused / timeout / 5xx (clients must keep a previous favicon)
 */
export type FaviconRemoteLookupResult =
  | { status: "found"; bytes: Uint8Array }
  | { status: "absent" }
  | { status: "unavailable" };

type FaviconOutboundFetchResult =
  | { status: "ok"; bytes: Uint8Array; contentType: string }
  | { status: "miss" }
  | { status: "unavailable" }
  | { status: "skip" };

type FaviconPinResolveResult =
  | { status: "pinned"; pinned: FaviconPinnedAddress }
  | { status: "unavailable" }
  | { status: "blocked" };

function combineLookupProgress(
  current: FaviconRemoteLookupResult | null,
  next: FaviconRemoteLookupResult,
): FaviconRemoteLookupResult {
  if (next.status === "found") {
    return next;
  }
  if (!current) {
    return next;
  }
  if (current.status === "found") {
    return current;
  }
  // Prefer a positive absence over pure unavailability once any probe contacted a site.
  if (current.status === "absent" || next.status === "absent") {
    return { status: "absent" };
  }
  return { status: "unavailable" };
}

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

async function resolvePinnedAddress(hostname: string): Promise<FaviconPinResolveResult> {
  try {
    const addresses = await hostResolver(hostname);
    if (addresses.length === 0) {
      return { status: "unavailable" };
    }
    if (!addresses.every((address) => !isDisallowedResolvedAddress(address))) {
      return { status: "blocked" };
    }
    for (const address of addresses) {
      const family = net.isIP(address);
      if (family === 4 || family === 6) {
        return { status: "pinned", pinned: { address, family } };
      }
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
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

/**
 * Registrable domain (eTLD+1) for a hostname via Public Suffix List.
 * Returns null when PSL cannot determine a domain (IP, localhost, unknown).
 */
export function registrableDomainFromHost(host: string): string | null {
  const normalized = stripIpv6Brackets(host).toLowerCase().replace(/^www\./i, "");
  if (!normalized || !isHostSuitableForFaviconLookup(normalized)) {
    return null;
  }
  const parsed = parsePublicSuffix(normalized, { allowPrivateDomains: true });
  const domain = parsed.domain?.toLowerCase() ?? null;
  if (!domain || !isHostSuitableForFaviconLookup(domain)) {
    return null;
  }
  return domain;
}

function tryParseHttpUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!isAllowedFaviconFetchUrl(url)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Probe order for one Website URL field:
 * full URL → subdomain/origin root → registrable domain root (deduped).
 */
export function expandFaviconProbeUrls(input: string): string[] {
  const url = tryParseHttpUrl(input);
  if (!url) {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    out.push(candidate);
  };

  push(url.href);

  const originRoot = `${url.origin}/`;
  push(originRoot);

  const host = url.hostname.replace(/^www\./i, "");
  const domain = registrableDomainFromHost(host);
  if (domain && domain !== host.toLowerCase()) {
    push(`${url.protocol}//${domain}/`);
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

type FaviconFetchKind = "image" | "html";

async function fetchOutboundBytes(
  urlString: string,
  kind: FaviconFetchKind,
  redirectCount = 0,
): Promise<FaviconOutboundFetchResult> {
  if (redirectCount > MAX_REDIRECTS) {
    return { status: "miss" };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { status: "skip" };
  }

  if (!isAllowedFaviconFetchUrl(url)) {
    return { status: "skip" };
  }

  const pin = await resolvePinnedAddress(url.hostname);
  if (pin.status === "unavailable") {
    return { status: "unavailable" };
  }
  if (pin.status === "blocked") {
    return { status: "skip" };
  }

  const maxBytes = kind === "html" ? MAX_FAVICON_HTML_BYTES : MAX_FAVICON_RESPONSE_BYTES;
  const accept =
    kind === "html"
      ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      : "image/png,image/x-icon,image/vnd.microsoft.icon,image/*,*/*;q=0.8";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await outboundRequest(url, {
      signal: controller.signal,
      pinned: pin.pinned,
      headers: {
        Accept: accept,
        "User-Agent": FAVICON_USER_AGENT,
      },
    });

    const next = redirectLocation(response.status, response.headers, url.href);
    if (next) {
      // Drain unused redirect body so sockets can close cleanly.
      await response.readBody(maxBytes).catch(() => null);
      return fetchOutboundBytes(next, kind, redirectCount + 1);
    }

    // 5xx: site answered but is temporarily broken — not a positive "no favicon".
    if (response.status >= 500) {
      await response.readBody(maxBytes).catch(() => null);
      return { status: "unavailable" };
    }

    if (response.status < 200 || response.status >= 300) {
      await response.readBody(maxBytes).catch(() => null);
      return { status: "miss" };
    }

    const contentType = (headerValue(response.headers, "content-type") ?? "").toLowerCase();
    if (kind === "image") {
      if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
        await response.readBody(maxBytes).catch(() => null);
        return { status: "miss" };
      }
    } else if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("octet-stream")
    ) {
      await response.readBody(maxBytes).catch(() => null);
      return { status: "miss" };
    }

    const bytes = await response.readBody(maxBytes);
    if (!bytes || bytes.byteLength === 0) {
      return { status: "miss" };
    }
    if (kind === "image" && !looksLikeImageBytes(bytes)) {
      return { status: "miss" };
    }
    return { status: "ok", bytes, contentType };
  } catch {
    // DNS already handled above; connection refused / timeout / reset → unavailable.
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageBytes(urlString: string): Promise<FaviconOutboundFetchResult> {
  return fetchOutboundBytes(urlString, "image");
}

type HtmlIconCandidate = {
  href: string;
  rel: string;
  sizes: string;
};

function parseHtmlAttribute(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = re.exec(tag);
  if (!match) {
    return null;
  }
  return (match[1] ?? match[2] ?? match[3] ?? "").trim() || null;
}

function isIconRelToken(rel: string): boolean {
  const tokens = rel
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.some(
    (token) =>
      token === "icon" ||
      token === "shortcut" ||
      token === "shortcut-icon" ||
      token === "apple-touch-icon" ||
      token === "apple-touch-icon-precomposed" ||
      token === "mask-icon",
  );
}

/** Extract `<link rel~=icon|apple-touch-icon>` hrefs from an HTML document. */
export function extractIconCandidatesFromHtml(html: string, baseUrl: string): HtmlIconCandidate[] {
  const out: HtmlIconCandidate[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const tag = match[0] ?? "";
    const rel = parseHtmlAttribute(tag, "rel");
    const href = parseHtmlAttribute(tag, "href");
    if (!rel || !href || !isIconRelToken(rel)) {
      continue;
    }
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    out.push({
      href: absolute,
      rel: rel.toLowerCase(),
      sizes: (parseHtmlAttribute(tag, "sizes") ?? "").toLowerCase(),
    });
  }
  return out;
}

function maxSizeHint(sizes: string): number {
  if (!sizes || sizes === "any") {
    return sizes === "any" ? 512 : 0;
  }
  let best = 0;
  for (const part of sizes.split(/\s+/)) {
    const match = /^(\d+)x(\d+)$/i.exec(part);
    if (!match) {
      continue;
    }
    const area = Number(match[1]) * Number(match[2]);
    if (Number.isFinite(area) && area > best) {
      best = area;
    }
  }
  return best;
}

function scoreHtmlIconCandidate(candidate: HtmlIconCandidate): number {
  const rel = candidate.rel;
  let score = maxSizeHint(candidate.sizes);
  if (rel.includes("apple-touch-icon")) {
    score += 10_000;
  } else if (/\bicon\b/.test(rel)) {
    score += 5_000;
  } else if (rel.includes("mask-icon")) {
    score += 1_000;
  }
  // Prefer raster-looking paths over SVG (we do not rasterize SVG).
  if (/\.svg(\?|#|$)/i.test(candidate.href)) {
    score -= 50_000;
  }
  return score;
}

async function fetchBestIconFromHtmlPage(pageUrl: string): Promise<FaviconRemoteLookupResult> {
  const page = await fetchOutboundBytes(pageUrl, "html");
  if (page.status === "unavailable") {
    return { status: "unavailable" };
  }
  if (page.status === "skip" || page.status === "miss") {
    return { status: "absent" };
  }
  // Some sites may serve the icon itself at the page URL.
  if (
    page.contentType.startsWith("image/") &&
    looksLikeImageBytes(page.bytes) &&
    page.bytes.byteLength >= 48 &&
    page.bytes.byteLength <= MAX_FAVICON_RESPONSE_BYTES
  ) {
    return { status: "found", bytes: page.bytes };
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(page.bytes);
  const candidates = extractIconCandidatesFromHtml(html, pageUrl)
    .slice()
    .sort((a, b) => scoreHtmlIconCandidate(b) - scoreHtmlIconCandidate(a));

  let sawUnavailable = false;
  for (const candidate of candidates) {
    if (/\.svg(\?|#|$)/i.test(candidate.href)) {
      continue;
    }
    const image = await fetchImageBytes(candidate.href);
    if (image.status === "ok" && image.bytes.byteLength >= 48) {
      return { status: "found", bytes: image.bytes };
    }
    if (image.status === "unavailable") {
      sawUnavailable = true;
    }
  }
  // Page HTML was reachable; missing/broken candidate icons are absence, not outage —
  // unless every candidate fetch failed with a network/5xx error and none succeeded.
  if (sawUnavailable && candidates.length > 0) {
    const nonSvg = candidates.filter((c) => !/\.svg(\?|#|$)/i.test(c.href));
    if (nonSvg.length > 0) {
      // At least one candidate was tried; HTML itself proved reachability → absent.
      return { status: "absent" };
    }
  }
  return { status: "absent" };
}

function isOriginRootUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  } catch {
    return false;
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
    const fetched = await fetchImageBytes(buildGoogleFaviconUrl(host));
    if (fetched.status !== "ok") {
      continue;
    }
    const bytes = fetched.bytes;
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

async function fetchDirectWellKnownFaviconBytes(host: string): Promise<FaviconRemoteLookupResult> {
  let sawUnavailable = false;
  let sawMiss = false;
  for (const url of buildDirectFaviconUrls(host)) {
    const image = await fetchImageBytes(url);
    if (image.status === "ok" && image.bytes.byteLength >= 48) {
      return { status: "found", bytes: image.bytes };
    }
    if (image.status === "unavailable") {
      sawUnavailable = true;
    } else if (image.status === "miss") {
      sawMiss = true;
    }
  }
  if (sawMiss) {
    return { status: "absent" };
  }
  if (sawUnavailable) {
    return { status: "unavailable" };
  }
  return { status: "absent" };
}

/**
 * Direct provider for one probe URL:
 * HTML `<link rel=icon>` (and related) first, then well-known origin paths for root probes.
 */
async function fetchDirectFaviconForProbeUrl(probeUrl: string): Promise<FaviconRemoteLookupResult> {
  const fromHtml = await fetchBestIconFromHtmlPage(probeUrl);
  if (fromHtml.status === "found") {
    return fromHtml;
  }

  if (!isOriginRootUrl(probeUrl)) {
    return fromHtml;
  }

  let host: string;
  try {
    host = new URL(probeUrl).hostname.replace(/^www\./i, "");
  } catch {
    return fromHtml;
  }
  const wellKnown = await fetchDirectWellKnownFaviconBytes(host);
  return combineLookupProgress(fromHtml, wellKnown);
}

async function fetchGoogleFaviconBytes(host: string): Promise<FaviconRemoteLookupResult> {
  const fetched = await fetchImageBytes(buildGoogleFaviconUrl(host));
  if (fetched.status === "unavailable") {
    return { status: "unavailable" };
  }
  if (fetched.status !== "ok") {
    return { status: "absent" };
  }
  if (await isGenericOrEmptyFavicon(fetched.bytes)) {
    return { status: "absent" };
  }
  return { status: "found", bytes: fetched.bytes };
}

export async function fetchRemoteFaviconBytes(
  host: string,
  options: FaviconFetchOptions = {},
): Promise<FaviconRemoteLookupResult> {
  const provider = options.provider ?? "direct";
  if (provider === "off") {
    return { status: "absent" };
  }

  const normalized = host.trim().toLowerCase().replace(/^www\./i, "");
  if (!normalized || !isHostSuitableForFaviconLookup(normalized)) {
    return { status: "absent" };
  }

  if (provider === "google") {
    return fetchGoogleFaviconBytes(normalized);
  }

  // Host-only entry point: treat as origin root (HTML `/` + well-known paths).
  return fetchDirectFaviconForProbeUrl(`https://${normalized}/`);
}

/**
 * Walk Website URL fields in list order. For each field probe:
 * full URL → subdomain/origin root → registrable domain root.
 */
export async function fetchRemoteFaviconBytesFromUrls(
  urls: readonly string[],
  options: FaviconFetchOptions = {},
): Promise<FaviconRemoteLookupResult> {
  const provider = options.provider ?? "direct";
  if (provider === "off") {
    return { status: "absent" };
  }

  let aggregate: FaviconRemoteLookupResult | null = null;

  for (const rawUrl of urls) {
    const probes = expandFaviconProbeUrls(rawUrl);
    if (probes.length === 0) {
      continue;
    }

    if (provider === "google") {
      const hosts: string[] = [];
      const seen = new Set<string>();
      for (const probe of probes) {
        const host = parseHostFromUrl(probe);
        if (!host || seen.has(host)) {
          continue;
        }
        seen.add(host);
        hosts.push(host);
      }
      for (const host of hosts) {
        const result = await fetchGoogleFaviconBytes(host);
        aggregate = combineLookupProgress(aggregate, result);
        if (aggregate.status === "found") {
          return aggregate;
        }
      }
      continue;
    }

    for (const probe of probes) {
      const result = await fetchDirectFaviconForProbeUrl(probe);
      aggregate = combineLookupProgress(aggregate, result);
      if (aggregate.status === "found") {
        return aggregate;
      }
    }
  }
  return aggregate ?? { status: "absent" };
}
