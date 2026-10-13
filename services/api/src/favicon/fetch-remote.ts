const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts used to capture Google's generic “no favicon” placeholder bytes (google provider only). */
const GENERIC_FAVICON_SENTINEL_HOSTS = ["invalid.invalid", "this-domain-does-not-exist.okkey"] as const;

/** Well-known origin-relative paths tried for the default (direct) provider. */
const DIRECT_FAVICON_PATHS = ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"] as const;

export type FaviconProvider = "direct" | "google" | "off";

export type FaviconFetchOptions = {
  /** Default `direct` — fetch from the site origin only (no third-party). */
  provider?: FaviconProvider;
};

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

function isIpv4Host(host: string): boolean {
  return IPV4_HOST_RE.test(host);
}

export function isHostSuitableForFaviconLookup(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local") || isIpv4Host(normalized)) {
    return false;
  }
  return normalized.includes(".");
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

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "image/png,image/x-icon,image/vnd.microsoft.icon,image/*,*/*;q=0.8" },
    });
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
