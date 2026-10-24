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

export type ItemFormFaviconPreviewState = {
  previewImageSrc: string | undefined;
  isLoading: boolean;
  /** Latest successful website preview PNG (for save without re-fetching). */
  previewPngBytes: Uint8Array | null;
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
  const [isLoading, setIsLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const previewPngBytesRef = useRef<Uint8Array | null>(null);
  const requestSeqRef = useRef(0);
  const lastFetchedUrlsKeyRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
      previewPngBytesRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (input.disabled || input.categoryId !== ITEM_CATEGORY_LOGIN) {
      requestSeqRef.current += 1;
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
      previewPngBytesRef.current = null;
      setPreviewPngBytes(null);
      setPreviewImageSrc(undefined);
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
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
      previewPngBytesRef.current = null;
      setPreviewPngBytes(null);
      setPreviewImageSrc(undefined);
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
            setPreviewPngBytes(bytes);
            setPreviewImageSrc(objectUrl);
            lastFetchedUrlsKeyRef.current = urlsKey;
          } else {
            revokeBlobUrl(blobUrlRef.current);
            blobUrlRef.current = null;
            previewPngBytesRef.current = null;
            setPreviewPngBytes(null);
            setPreviewImageSrc(undefined);
            lastFetchedUrlsKeyRef.current = urlsKey;
          }
        } catch {
          if (controller.signal.aborted) {
            return;
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

  return { previewImageSrc, isLoading, previewPngBytes };
}
