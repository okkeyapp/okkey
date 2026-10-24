import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { useEffect, useRef, useState } from "react";

import { previewItemFavicon } from "../api/item-favicons";

const DEBOUNCE_MS = 400;

function revokeBlobUrl(url: string | null): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export type ItemFormFaviconPreviewState = {
  previewImageSrc: string | undefined;
  /** Raw PNG from the last successful website preview (for save without a second preview GET). */
  previewPngBytes: Uint8Array | null;
  isLoading: boolean;
};

/** Live favicon preview for item forms — never writes to MinIO. */
export function useItemFormFaviconPreview(input: {
  accessToken: string | null;
  categoryId: string;
  urls: readonly string[];
  disabled?: boolean;
}): ItemFormFaviconPreviewState {
  const urlsKey = input.urls.join("\u0001");
  const [previewImageSrc, setPreviewImageSrc] = useState<string | undefined>();
  const [previewPngBytes, setPreviewPngBytes] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const previewPngBytesRef = useRef<Uint8Array | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(
    () => () => {
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
    },
    [],
  );

  useEffect(() => {
    revokeBlobUrl(blobUrlRef.current);
    blobUrlRef.current = null;
    previewPngBytesRef.current = null;
    setPreviewImageSrc(undefined);
    setPreviewPngBytes(null);

    if (input.disabled || input.categoryId !== ITEM_CATEGORY_LOGIN) {
      setIsLoading(false);
      return;
    }
    if (!input.accessToken) {
      setIsLoading(false);
      return;
    }
    if (input.urls.length === 0) {
      setIsLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;
    setIsLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const blob = await previewItemFavicon(input.accessToken!, input.urls);
          if (seq !== requestSeqRef.current) {
            return;
          }

          if (blob) {
            const pngBytes = new Uint8Array(await blob.arrayBuffer());
            const objectUrl = URL.createObjectURL(blob);
            blobUrlRef.current = objectUrl;
            previewPngBytesRef.current = pngBytes;
            setPreviewPngBytes(pngBytes);
            setPreviewImageSrc(objectUrl);
          }
        } catch {
          /* monogram / category icon fallback in tile */
        } finally {
          if (seq === requestSeqRef.current) {
            setIsLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [urlsKey, input.accessToken, input.categoryId, input.urls, input.disabled]);

  return {
    previewImageSrc,
    previewPngBytes: previewPngBytesRef.current ?? previewPngBytes,
    isLoading,
  };
}
