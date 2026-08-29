import type {
  DomainCapabilitiesCacheRecord,
  DomainCapabilitiesCatalog,
  DomainCapabilitiesEntries,
} from "./domainCapabilitiesTypes";

const STORAGE_KEY = "okkey.monitoring.domainCatalog.v1";
const ATTEMPT_KEY = "okkey.monitoring.domainCatalog.attempt.v1";

/** Re-check GitHub at most once per day after a successful catalog fetch. */
export const DOMAIN_CAPABILITIES_REFRESH_MS = 24 * 60 * 60 * 1000;

/** After a failed GitHub fetch, do not retry until this cooldown elapses. */
export const DOMAIN_CAPABILITIES_RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;

export type DomainCapabilitiesFetchAttempt = {
  at: number;
  ok: boolean;
};

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

export function loadDomainCapabilitiesFetchAttempt(): DomainCapabilitiesFetchAttempt | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const row = parsed as DomainCapabilitiesFetchAttempt;
    if (typeof row.at !== "number" || typeof row.ok !== "boolean") {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export function saveDomainCapabilitiesFetchAttempt(ok: boolean, at = Date.now()): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ at, ok } satisfies DomainCapabilitiesFetchAttempt));
  } catch {
    // quota / private mode
  }
}

/**
 * Whether we should hit GitHub on this visit.
 * - Skip if successful cache is younger than 24h.
 * - Skip if last attempt failed within the fail cooldown (avoids ERR_TIMED_OUT on every reload).
 */
export function shouldAttemptDomainCapabilitiesNetworkFetch(nowMs = Date.now()): boolean {
  const cached = loadDomainCapabilitiesCache();
  if (cached && !shouldRefreshDomainCapabilitiesCache(cached.fetchedAt, nowMs)) {
    return false;
  }
  const attempt = loadDomainCapabilitiesFetchAttempt();
  if (attempt && !attempt.ok && nowMs - attempt.at < DOMAIN_CAPABILITIES_RETRY_AFTER_FAIL_MS) {
    return false;
  }
  return true;
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
