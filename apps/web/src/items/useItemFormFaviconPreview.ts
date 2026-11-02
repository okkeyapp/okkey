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
  /**
   * Bumped only on a committed record-name change (change/focusout with a new value).
   * Typing other fields must not change this — favicon re-fetch is limited to name + website URL.
   */
  nameFetchRevision?: number;
}): ItemFormFaviconPreviewState {
  const urlsKey = websiteUrlsLookupKey(input.urls);
  const nameFetchRevision = input.nameFetchRevision ?? 0;
  const [previewImageSrc, setPreviewImageSrc] = useState<string | undefined>();
  const [previewPngBytes, setPreviewPngBytes] = useState<Uint8Array | null>(null);
  const [previewUrlsKey, setPreviewUrlsKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const previewPngBytesRef = useRef<Uint8Array | null>(null);
  const previewUrlsKeyRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const lastFetchedUrlsKeyRef = useRef<string | null>(null);
  const lastFetchedNameRevisionRef = useRef(0);

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
      lastFetchedUrlsKeyRef.current === null &&
      nameFetchRevision === 0
    ) {
      // Keep showing the stored attachment; do not hit /favicon/preview on dialog open.
      setIsLoading(false);
      lastFetchedUrlsKeyRef.current = urlsKey;
      lastFetchedNameRevisionRef.current = nameFetchRevision;
      return;
    }

    // Stable URL key + name revision already handled — ignore array identity / unrelated typing.
    if (
      lastFetchedUrlsKeyRef.current === urlsKey &&
      lastFetchedNameRevisionRef.current === nameFetchRevision
    ) {
      setIsLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;
    const urlsSnapshot = [...input.urls];
    const urlsChanged = lastFetchedUrlsKeyRef.current !== urlsKey;
    // Drop stale preview when the website URL list changes so Save cannot attach the previous
    // URL's icon while the new lookup is in flight. Name-only re-fetch keeps the current preview
    // until the new bytes arrive (avoids flashing a monogram over a still-valid stored icon).
    if (urlsChanged) {
      clearPreview();
    }
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
            lastFetchedNameRevisionRef.current = nameFetchRevision;
          } else {
            // Positive absent: clear live preview bytes. Saved attachment is preserved on Save
            // when website URLs are unchanged (see syncItemFaviconForPlaintext).
            clearPreview();
            lastFetchedUrlsKeyRef.current = urlsKey;
            lastFetchedNameRevisionRef.current = nameFetchRevision;
          }
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          // Failed lookup — do not keep bytes from a previous URL key; name-only failures keep UI.
          if (seq === requestSeqRef.current) {
            if (urlsChanged) {
              clearPreview();
            }
            lastFetchedUrlsKeyRef.current = urlsKey;
            lastFetchedNameRevisionRef.current = nameFetchRevision;
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
    // Depend on urlsKey (content) + committed name revision — typing other fields must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input.urls covered by urlsKey
  }, [
    urlsKey,
    nameFetchRevision,
    input.accessToken,
    input.categoryId,
    input.disabled,
    input.skipFetchForUrlsKey,
  ]);

  return { previewImageSrc, isLoading, previewPngBytes, previewUrlsKey };
}
