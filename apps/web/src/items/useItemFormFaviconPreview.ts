import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { useEffect, useRef, useState } from "react";

import { previewItemFavicon } from "../api/item-favicons";

const DEBOUNCE_MS = 400;

function revokeBlobUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function websiteUrlsLookupKey(urls: readonly string[]): string {
  return urls.map((url) => url.trim()).filter(Boolean).join("\u0001");
}

/**
 * Save must only reuse preview bytes fetched for the current website URL list.
 * Stale bytes from a previous URL (in-flight preview) must never be attached.
 */
export function websiteFaviconPngForCurrentUrls(input: {
  currentUrlsKey: string;
  previewUrlsKey: string | null;
  previewPngBytes: Uint8Array | null;
}): Uint8Array | null {
  if (!input.previewPngBytes || input.previewPngBytes.byteLength === 0) {
    return null;
  }
  if (!input.currentUrlsKey || input.previewUrlsKey !== input.currentUrlsKey) {
    return null;
  }
  return input.previewPngBytes;
}

export type ItemFormFaviconPreviewState = {
  previewImageSrc: string | undefined;
  isLoading: boolean;
  /** Latest successful website preview PNG (for save without re-fetching). */
  previewPngBytes: Uint8Array | null;
  /** URL lookup key the current preview bytes belong to; null when cleared / loading. */
  previewUrlsKey: string | null;
};

/** Live favicon preview for item forms — never writes to MinIO. */
export function useItemFormFaviconPreview(input: {
  accessToken: string | null;
  categoryId: string;
  urls: readonly string[];
  disabled?: boolean;
  /**
   * When set with a stored icon, skip the initial preview request until the URL list
   * diverges from this key (edit dialog with an already-saved favicon).
   */
  skipFetchForUrlsKey?: string | null;
}): ItemFormFaviconPreviewState {
  const urlsKey = websiteUrlsLookupKey(input.urls);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | undefined>();
  const [previewPngBytes, setPreviewPngBytes] = useState<Uint8Array | null>(null);
  const [previewUrlsKey, setPreviewUrlsKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const previewPngBytesRef = useRef<Uint8Array | null>(null);
  const previewUrlsKeyRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const lastFetchedUrlsKeyRef = useRef<string | null>(null);

  const clearPreview = () => {
    revokeBlobUrl(blobUrlRef.current);
    blobUrlRef.current = null;
    previewPngBytesRef.current = null;
    previewUrlsKeyRef.current = null;
    setPreviewPngBytes(null);
    setPreviewUrlsKey(null);
    setPreviewImageSrc(undefined);
  };

  useEffect(
    () => () => {
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
      previewPngBytesRef.current = null;
      previewUrlsKeyRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (input.disabled || input.categoryId !== ITEM_CATEGORY_LOGIN) {
      requestSeqRef.current += 1;
      clearPreview();
      setIsLoading(false);
      lastFetchedUrlsKeyRef.current = null;
      return;
    }
    if (!input.accessToken) {
      setIsLoading(false);
      return;
    }
    if (!urlsKey) {
      requestSeqRef.current += 1;
      clearPreview();
      setIsLoading(false);
      lastFetchedUrlsKeyRef.current = "";
      return;
    }

    if (
      input.skipFetchForUrlsKey != null &&
      input.skipFetchForUrlsKey === urlsKey &&
      lastFetchedUrlsKeyRef.current === null
    ) {
      // Keep showing the stored attachment; do not hit /favicon/preview on dialog open.
      setIsLoading(false);
      lastFetchedUrlsKeyRef.current = urlsKey;
      return;
    }

    // Stable key already handled (skip or completed fetch) — ignore array identity churn.
    if (lastFetchedUrlsKeyRef.current === urlsKey) {
      setIsLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;
    const urlsSnapshot = [...input.urls];
    // Drop stale preview immediately so Save cannot attach the previous URL's icon
    // while the new lookup is in flight.
    clearPreview();
    setIsLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const blob = await previewItemFavicon(input.accessToken!, urlsSnapshot, {
            signal: controller.signal,
          });
          if (seq !== requestSeqRef.current) {
            return;
          }

          if (blob) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            if (seq !== requestSeqRef.current) {
              return;
            }
            revokeBlobUrl(blobUrlRef.current);
            const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
            blobUrlRef.current = objectUrl;
            previewPngBytesRef.current = bytes;
            previewUrlsKeyRef.current = urlsKey;
            setPreviewPngBytes(bytes);
            setPreviewUrlsKey(urlsKey);
            setPreviewImageSrc(objectUrl);
            lastFetchedUrlsKeyRef.current = urlsKey;
          } else {
            clearPreview();
            lastFetchedUrlsKeyRef.current = urlsKey;
          }
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          // Failed lookup for this URL key — never keep a previous URL's bytes.
          if (seq === requestSeqRef.current) {
            clearPreview();
            lastFetchedUrlsKeyRef.current = urlsKey;
          }
          /* monogram / category icon fallback in tile */
        } finally {
          if (seq === requestSeqRef.current) {
            setIsLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Depend on urlsKey (content), not array identity — typing other fields must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input.urls covered by urlsKey
  }, [urlsKey, input.accessToken, input.categoryId, input.disabled, input.skipFetchForUrlsKey]);

  return { previewImageSrc, isLoading, previewPngBytes, previewUrlsKey };
}
