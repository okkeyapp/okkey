import type {
  DomainCapabilitiesCacheRecord,
  DomainCapabilitiesCatalog,
  DomainCapabilitiesEntries,
} from "./domainCapabilitiesTypes";

const STORAGE_KEY = "okkey.monitoring.domainCatalog.v1";
export const DOMAIN_CAPABILITIES_REFRESH_MS = 24 * 60 * 60 * 1000;

export function shouldRefreshDomainCapabilitiesCache(fetchedAt: number, nowMs = Date.now()): boolean {
  return nowMs - fetchedAt >= DOMAIN_CAPABILITIES_REFRESH_MS;
}

export function loadDomainCapabilitiesCache(): DomainCapabilitiesCacheRecord | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const row = parsed as DomainCapabilitiesCacheRecord;
    if (
      typeof row.version !== "string" ||
      typeof row.sha256 !== "string" ||
      typeof row.fetchedAt !== "number" ||
      !row.entries ||
      typeof row.entries !== "object"
    ) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export function saveDomainCapabilitiesCache(catalog: DomainCapabilitiesCatalog, fetchedAt = Date.now()): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const record: DomainCapabilitiesCacheRecord = {
    version: catalog.version,
    sha256: catalog.sha256,
    fetchedAt,
    entries: catalog.entries,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // quota / private mode
  }
}

export function getCachedDomainCapabilitiesEntries(): DomainCapabilitiesEntries | null {
  return loadDomainCapabilitiesCache()?.entries ?? null;
}

export function isCacheValidForManifest(
  cache: DomainCapabilitiesCacheRecord | null,
  manifestVersion: string,
  nowMs = Date.now(),
): boolean {
  if (!cache) {
    return false;
  }
  if (cache.version !== manifestVersion) {
    return false;
  }
  return !shouldRefreshDomainCapabilitiesCache(cache.fetchedAt, nowMs);
}
