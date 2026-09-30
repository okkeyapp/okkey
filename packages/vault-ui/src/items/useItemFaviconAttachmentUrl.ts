import { downloadKeyFieldFileAttachment, keyFieldFileValueFromFaviconId } from "@okkey/vault";
import { useEffect, useMemo, useState } from "react";

const faviconUrlCache = new Map<string, string>();
const pendingFaviconUrlCache = new Map<string, Promise<string>>();

function cacheKey(input: { vaultId: string; itemId: string; faviconId: string }): string {
  return `${input.vaultId}:${input.itemId}:${input.faviconId}`;
}

export function useItemFaviconAttachmentUrl(input: {
  apiBaseUrl: string;
  accessToken: string | null;
  vaultKey: Uint8Array | null | undefined;
  vaultId?: string;
  itemId?: string;
  faviconId?: string;
  enabled?: boolean;
}): { imageSrc: string | undefined; loading: boolean } {
  const key = useMemo(() => {
    if (!input.vaultId || !input.itemId || !input.faviconId) {
      return null;
    }
    return cacheKey({ vaultId: input.vaultId, itemId: input.itemId, faviconId: input.faviconId });
  }, [input.vaultId, input.itemId, input.faviconId]);
  const [imageSrc, setImageSrc] = useState<string | undefined>(() => (key ? faviconUrlCache.get(key) : undefined));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setImageSrc(key ? faviconUrlCache.get(key) : undefined);
  }, [key]);

  useEffect(() => {
    if (
      input.enabled === false ||
      !key ||
      !input.accessToken ||
      !input.vaultKey ||
      !input.vaultId ||
      !input.itemId ||
      !input.faviconId ||
      faviconUrlCache.has(key)
    ) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    let pending = pendingFaviconUrlCache.get(key);
    if (!pending) {
      pending = downloadKeyFieldFileAttachment({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        vaultId: input.vaultId,
        itemId: input.itemId,
        vaultKey: input.vaultKey,
        file: keyFieldFileValueFromFaviconId(input.faviconId),
      }).then(
        (url) => {
          faviconUrlCache.set(key, url);
          pendingFaviconUrlCache.delete(key);
          return url;
        },
        (error: unknown) => {
          // Do not poison the pending map with a rejected promise — retry when
          // vault key / token becomes available (common in extension popup).
          pendingFaviconUrlCache.delete(key);
          throw error;
        },
      );
      pendingFaviconUrlCache.set(key, pending);
    }
    pending
      .then((url) => {
        if (!cancelled) {
          setImageSrc(url);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    input.apiBaseUrl,
    input.accessToken,
    input.enabled,
    input.faviconId,
    input.itemId,
    input.vaultId,
    input.vaultKey,
    key,
  ]);

  return { imageSrc, loading };
}
