import type { ItemFaviconSource } from "@okkey/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { resizeImageFileToFaviconPngBytes } from "../lib/resizeFaviconImage";
import { useItemFormFaviconPreview } from "./useItemFormFaviconPreview";

function revokeObjectUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export type ItemFormFaviconSyncInput = {
  faviconSource?: ItemFaviconSource;
  manualFaviconPng?: Uint8Array | null;
};

export function useItemFormFavicon(input: {
  accessToken: string | null;
  categoryId: string;
  urls: readonly string[];
  initialFaviconId?: string;
  initialFaviconSource?: ItemFaviconSource;
}) {
  const [faviconSource, setFaviconSource] = useState<ItemFaviconSource | undefined>(input.initialFaviconSource);
  const [manualPreviewUrl, setManualPreviewUrl] = useState<string | undefined>();
  const [pendingManualPng, setPendingManualPng] = useState<Uint8Array | null>(null);
  const pendingManualPngRef = useRef<Uint8Array | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const manualPreviewUrlRef = useRef<string | null>(null);

  const autoPreviewDisabled = faviconSource === "manual" || pendingManualPng !== null;
  const websitePreview = useItemFormFaviconPreview({
    accessToken: input.accessToken,
    categoryId: input.categoryId,
    urls: input.urls,
    disabled: autoPreviewDisabled,
  });

  useEffect(
    () => () => {
      revokeObjectUrl(manualPreviewUrlRef.current);
      manualPreviewUrlRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setFaviconSource(input.initialFaviconSource);
    pendingManualPngRef.current = null;
    setPendingManualPng(null);
    setUploadError(null);
    revokeObjectUrl(manualPreviewUrlRef.current);
    manualPreviewUrlRef.current = null;
    setManualPreviewUrl(undefined);
  }, [input.categoryId, input.initialFaviconId, input.initialFaviconSource]);

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
    return {
      faviconSource,
      ...(manualFaviconPng && manualFaviconPng.byteLength > 0 ? { manualFaviconPng } : {}),
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
  };
}
