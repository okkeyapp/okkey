const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Hosts used to capture Google's generic “no favicon” placeholder bytes. */
const GENERIC_FAVICON_SENTINEL_HOSTS = ["invalid.invalid", "this-domain-does-not-exist.okkey"] as const;

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

function buildGoogleFaviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/png,image/*" },
    });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 ? bytes : null;
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

export async function fetchRemoteFaviconBytes(host: string): Promise<Uint8Array | null> {
  const normalized = host.trim().toLowerCase().replace(/^www\./i, "");
  if (!normalized || !isHostSuitableForFaviconLookup(normalized)) {
    return null;
  }

  return fetchImageBytes(buildGoogleFaviconUrl(normalized));
}

/**
 * Walk URLs in list order; return bytes for the first host whose favicon is not generic/empty.
 */
export async function fetchRemoteFaviconBytesFromUrls(urls: readonly string[]): Promise<Uint8Array | null> {
  const hosts = hostsFromUrls(urls);
  for (const host of hosts) {
    const bytes = await fetchRemoteFaviconBytes(host);
    if (!bytes) {
      continue;
    }
    if (await isGenericOrEmptyFavicon(bytes)) {
      continue;
    }
    return bytes;
  }
  return null;
}
