import { useEffect, useState } from "react";
import type { FaviconProviderMode } from "@okkey/ui/lib/favicon-mode";

import { fetchClientOriginFavicon, loadFaviconProviderMode } from "./faviconMode";

export function useFaviconProviderMode(apiBaseUrl: string): FaviconProviderMode | null {
  const [mode, setMode] = useState<FaviconProviderMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadFaviconProviderMode(apiBaseUrl).then((next) => {
      if (!cancelled) {
        setMode(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);
  return mode;
}

function faviconBlobType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49) {
    return "image/gif";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49) {
    return "image/webp";
  }
  return "image/x-icon";
}

/**
 * Extension pages cannot load third-party `<img>` URLs (img-src is self/data/blob).
 * In `client` mode, fetch the site favicon and expose a blob URL. `off` does not fetch.
 */
export function useClientWebsiteIconSrc(
  apiBaseUrl: string,
  urls: readonly string[] | undefined,
  enabled: boolean,
): string | undefined {
  const mode = useFaviconProviderMode(apiBaseUrl);
  const [src, setSrc] = useState<string | undefined>();
  const urlsKey = urls?.join("\n") ?? "";

  useEffect(() => {
    if (!enabled || mode !== "client" || !urls || urls.length === 0) {
      setSrc(undefined);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(undefined);
    void fetchClientOriginFavicon(urls).then((bytes) => {
      if (cancelled || !bytes) {
        if (!cancelled) {
          setSrc(undefined);
        }
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: faviconBlobType(bytes) }));
      setSrc(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    // urlsKey captures the list contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urls covered by urlsKey
  }, [apiBaseUrl, enabled, mode, urlsKey]);

  return src;
}
