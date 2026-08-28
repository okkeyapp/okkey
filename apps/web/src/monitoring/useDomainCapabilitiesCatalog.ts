import { useEffect, useState } from "react";

import {
  isCacheValidForManifest,
  loadDomainCapabilitiesCache,
  saveDomainCapabilitiesCache,
  shouldRefreshDomainCapabilitiesCache,
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
  catalog: DomainCapabilitiesCatalog | null;
  loading: boolean;
  source: DomainCapabilitiesSource | null;
};

export function useDomainCapabilitiesCatalog(enabled: boolean): DomainCapabilitiesCatalogState {
  const [catalog, setCatalog] = useState<DomainCapabilitiesCatalog | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [source, setSource] = useState<DomainCapabilitiesSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      const now = Date.now();
      const cached = loadDomainCapabilitiesCache();

      try {
        const manifest = await fetchDomainCapabilitiesManifest();
        if (cancelled) {
          return;
        }

        if (isCacheValidForManifest(cached, manifest.version, now)) {
          setCatalog({
            version: cached!.version,
            generatedAt: manifest.generatedAt,
            sha256: cached!.sha256,
            entries: cached!.entries,
          });
          setSource("cache");
          setLoading(false);
          return;
        }

        const needsCatalogFetch =
          !cached ||
          cached.version !== manifest.version ||
          cached.sha256 !== manifest.sha256 ||
          shouldRefreshDomainCapabilitiesCache(cached.fetchedAt, now);

        if (!needsCatalogFetch && cached) {
          setCatalog({
            version: cached.version,
            generatedAt: manifest.generatedAt,
            sha256: cached.sha256,
            entries: cached.entries,
          });
          setSource("cache");
          setLoading(false);
          return;
        }

        const remote = await fetchDomainCapabilitiesCatalog(manifest.sha256);
        if (cancelled) {
          return;
        }
        saveDomainCapabilitiesCache(remote, now);
        setCatalog(remote);
        setSource("github");
      } catch {
        if (cancelled) {
          return;
        }
        if (cached) {
          setCatalog({
            version: cached.version,
            generatedAt: new Date(cached.fetchedAt).toISOString(),
            sha256: cached.sha256,
            entries: cached.entries,
          });
          setSource("cache");
        } else {
          setCatalog(loadBaselineDomainCapabilitiesCatalog());
          setSource("baseline");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { catalog, loading, source };
}
