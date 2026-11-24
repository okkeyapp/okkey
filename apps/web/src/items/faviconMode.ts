import { useEffect, useMemo, useState } from "react";
import {
  clientSideFaviconUrlFromUrls,
  parseFaviconProviderMode,
  type FaviconProviderMode,
} from "@okkey/ui";

import { getApiBaseUrl } from "../api/client";

const cache = new Map<string, Promise<FaviconProviderMode>>();

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

/** Cached `GET /favicon/config`. Failures stay `off` so item domains are not sent. */
export function loadFaviconProviderMode(apiBaseUrl = getApiBaseUrl()): Promise<FaviconProviderMode> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const existing = cache.get(base);
  if (existing) {
    return existing;
  }
  const pending = readProvider(base);
  cache.set(base, pending);
  return pending;
}

/** `null` until the mode is known. Callers must not hit `/favicon/preview` while this is null. */
export function useFaviconProviderMode(): FaviconProviderMode | null {
  const [mode, setMode] = useState<FaviconProviderMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadFaviconProviderMode().then((next) => {
      if (!cancelled) {
        setMode(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}

/** Site-origin icon for `client` mode when the item has no stored favicon. Otherwise undefined. */
export function useClientWebsiteIconSrc(
  urls: readonly string[] | undefined,
  enabled: boolean,
): string | undefined {
  const mode = useFaviconProviderMode();
  return useMemo(() => {
    if (!enabled || mode !== "client" || !urls || urls.length === 0) {
      return undefined;
    }
    return clientSideFaviconUrlFromUrls(urls) ?? undefined;
  }, [enabled, mode, urls]);
}
