import type { ItemFaviconSource } from "@okkey/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resizeImageFileToFaviconPngBytes } from "../lib/resizeFaviconImage";
import {
  useItemFormFaviconPreview,
  websiteFaviconPngForCurrentUrls,
  websiteUrlsLookupKey,
} from "./useItemFormFaviconPreview";

function revokeObjectUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export type ItemFormFaviconSyncInput = {
  faviconSource?: ItemFaviconSource;
  manualFaviconPng?: Uint8Array | null;
  /** Website preview PNG already fetched in the form (save must not re-hit /favicon/preview). */
  websiteFaviconPng?: Uint8Array | null;
  /** Reuse an existing stored favicon (e.g. from template/copy) when no new PNG is pending. */
  reuseFaviconId?: string;
  reuseFaviconItemId?: string;
};

export function useItemFormFavicon(input: {
  accessToken: string | null;
  categoryId: string;
  urls: readonly string[];
  initialFaviconId?: string;
  initialFaviconItemId?: string;
  initialFaviconSource?: ItemFaviconSource;
  /** URL list key at dialog open — used to skip the redundant edit-open preview fetch. */
  initialUrlsKey?: string | null;
}) {
  const [faviconSource, setFaviconSource] = useState<ItemFaviconSource | undefined>(input.initialFaviconSource);
  const [manualPreviewUrl, setManualPreviewUrl] = useState<string | undefined>();
  const [pendingManualPng, setPendingManualPng] = useState<Uint8Array | null>(null);
  const pendingManualPngRef = useRef<Uint8Array | null>(null);
  const initialFaviconIdRef = useRef(input.initialFaviconId);
  const initialFaviconItemIdRef = useRef(input.initialFaviconItemId);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const manualPreviewUrlRef = useRef<string | null>(null);

  const skipFetchForUrlsKey = useMemo(() => {
    if (!input.initialFaviconId?.trim()) {
      return null;
    }
    return input.initialUrlsKey ?? null;
  }, [input.initialFaviconId, input.initialUrlsKey]);

  const autoPreviewDisabled = faviconSource === "manual" || pendingManualPng !== null;
  const websitePreview = useItemFormFaviconPreview({
    accessToken: input.accessToken,
    categoryId: input.categoryId,
    urls: input.urls,
    disabled: autoPreviewDisabled,
    skipFetchForUrlsKey,
  });
  const websitePreviewPngRef = useRef<Uint8Array | null>(null);
  const websitePreviewUrlsKeyRef = useRef<string | null>(null);
  const currentUrlsKey = websiteUrlsLookupKey(input.urls);
  const currentUrlsKeyRef = useRef(currentUrlsKey);
  currentUrlsKeyRef.current = currentUrlsKey;
  websitePreviewPngRef.current = websitePreview.previewPngBytes;
  websitePreviewUrlsKeyRef.current = websitePreview.previewUrlsKey;

  useEffect(
    () => () => {
      revokeObjectUrl(manualPreviewUrlRef.current);
      manualPreviewUrlRef.current = null;
    },
    [],
  );

  useEffect(() => {
    initialFaviconIdRef.current = input.initialFaviconId;
    initialFaviconItemIdRef.current = input.initialFaviconItemId;
    setFaviconSource(input.initialFaviconSource);
    pendingManualPngRef.current = null;
    setPendingManualPng(null);
    setUploadError(null);
    revokeObjectUrl(manualPreviewUrlRef.current);
    manualPreviewUrlRef.current = null;
    setManualPreviewUrl(undefined);
  }, [input.categoryId, input.initialFaviconId, input.initialFaviconItemId, input.initialFaviconSource]);

  const uploadIconFile = useCallback(async (file: File) => {
    setUploadError(null);
    try {
      const pngBytes = await resizeImageFileToFaviconPngBytes(file);
      revokeObjectUrl(manualPreviewUrlRef.current);
      const objectUrl = URL.createObjectURL(new Blob([pngBytes], { type: "image/png" }));
      manualPreviewUrlRef.current = objectUrl;
      setManualPreviewUrl(objectUrl);
      pendingManualPngRef.current = pngBytes;
      setPendingManualPng(pngBytes);
      setFaviconSource("manual");
    } catch {
      setUploadError("invalid");
    }
  }, []);

  const previewImageSrc = manualPreviewUrl ?? websitePreview.previewImageSrc;
  const previewLoading = manualPreviewUrl ? false : websitePreview.isLoading;

  const getSyncInput = useCallback((): ItemFormFaviconSyncInput => {
    const manualFaviconPng = pendingManualPngRef.current ?? pendingManualPng;
    const websiteFaviconPng =
      !manualFaviconPng && faviconSource !== "manual"
        ? websiteFaviconPngForCurrentUrls({
            currentUrlsKey: currentUrlsKeyRef.current,
            previewUrlsKey: websitePreviewUrlsKeyRef.current,
            previewPngBytes: websitePreviewPngRef.current,
          })
        : null;
    const reuseFaviconId =
      !manualFaviconPng && faviconSource === "manual"
        ? initialFaviconIdRef.current?.trim() || undefined
        : undefined;
    const reuseFaviconItemId = reuseFaviconId ? initialFaviconItemIdRef.current?.trim() || undefined : undefined;
    return {
      faviconSource,
      ...(manualFaviconPng && manualFaviconPng.byteLength > 0 ? { manualFaviconPng } : {}),
      ...(websiteFaviconPng && websiteFaviconPng.byteLength > 0 ? { websiteFaviconPng } : {}),
      ...(reuseFaviconId ? { reuseFaviconId } : {}),
      ...(reuseFaviconItemId ? { reuseFaviconItemId } : {}),
    };
  }, [faviconSource, pendingManualPng]);

  return {
    previewImageSrc,
    previewLoading,
    faviconSource,
    uploadError,
    uploadIconFile,
    clearUploadError: () => setUploadError(null),
    getSyncInput,
    urlsLookupKey: currentUrlsKey,
  };
}
