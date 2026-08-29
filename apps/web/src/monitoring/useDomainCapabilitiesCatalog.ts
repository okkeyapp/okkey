import { useEffect, useState } from "react";

import {
  loadDomainCapabilitiesCache,
  saveDomainCapabilitiesCache,
  saveDomainCapabilitiesFetchAttempt,
  shouldAttemptDomainCapabilitiesNetworkFetch,
} from "./domainCapabilitiesCache";
import {
  fetchDomainCapabilitiesCatalog,
  fetchDomainCapabilitiesManifest,
  loadBaselineDomainCapabilitiesCatalog,
} from "./fetchDomainCapabilitiesCatalog";
import type {
  DomainCapabilitiesCatalog,
  DomainCapabilitiesSource,
} from "./domainCapabilitiesTypes";

export type DomainCapabilitiesCatalogState = {
  catalog: DomainCapabilitiesCatalog;
  source: DomainCapabilitiesSource;
};

function resolvePaintCatalog(): {
  catalog: DomainCapabilitiesCatalog;
  source: DomainCapabilitiesSource;
} {
  const cached = loadDomainCapabilitiesCache();
  if (cached) {
    return {
      catalog: {
        version: cached.version,
        generatedAt: new Date(cached.fetchedAt).toISOString(),
        sha256: cached.sha256,
        entries: cached.entries,
      },
      source: "cache",
    };
  }
  return {
    catalog: loadBaselineDomainCapabilitiesCatalog(),
    source: "baseline",
  };
}

/**
 * Catalog is always available synchronously (cache or bundled baseline).
 * Background refresh races GitHub raw + jsDelivr + statically.io and stores
 * the first successful catalog in localStorage for the next visit (no mid-session KPI swap).
 *
 * Freshness:
 * - Successful fetch → revalidate after 24h (`DOMAIN_CAPABILITIES_REFRESH_MS`).
 * - Failed fetch → cooldown 1h before retry (`DOMAIN_CAPABILITIES_RETRY_AFTER_FAIL_MS`).
 */
export function useDomainCapabilitiesCatalog(enabled: boolean): DomainCapabilitiesCatalogState {
  const [initial] = useState(resolvePaintCatalog);
  const [catalog] = useState<DomainCapabilitiesCatalog>(initial.catalog);
  const [source] = useState<DomainCapabilitiesSource>(initial.source);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!shouldAttemptDomainCapabilitiesNetworkFetch()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const cached = loadDomainCapabilitiesCache();
        const manifest = await fetchDomainCapabilitiesManifest();
        if (cancelled) {
          return;
        }
        if (
          cached &&
          cached.version === manifest.version &&
          cached.sha256 === manifest.sha256
        ) {
          // Touch freshness without re-downloading the full catalog.
          saveDomainCapabilitiesCache(
            {
              version: cached.version,
              generatedAt: manifest.generatedAt,
              sha256: cached.sha256,
              entries: cached.entries,
            },
            Date.now(),
          );
          saveDomainCapabilitiesFetchAttempt(true);
          return;
        }
        const remote = await fetchDomainCapabilitiesCatalog(manifest.sha256);
        if (cancelled) {
          return;
        }
        saveDomainCapabilitiesCache(remote);
        saveDomainCapabilitiesFetchAttempt(true);
      } catch {
        saveDomainCapabilitiesFetchAttempt(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { catalog, source };
}
