import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { clientSideFaviconUrlFromUrls, faviconProviderUsesServerPreview, urlsForRemoteFavicon } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import { previewItemFavicon } from "../../api/item-favicons";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useFaviconProviderMode } from "../../items/faviconMode";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";

function collectWebsiteUrlsFromItem(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter(Boolean);
}

export function useCapsuleItemFavicon(item: ItemPlaintextV2): {
  previewImageSrc: string | undefined;
  previewLoading: boolean;
} {
  const { accessToken, vaultKey } = useAuthVault();
  const iconMode = useFaviconProviderMode();
  const websiteUrls = useMemo(() => collectWebsiteUrlsFromItem(item), [item]);
  const remoteUrls = useMemo(() => urlsForRemoteFavicon(websiteUrls), [websiteUrls]);
  const serverPreview = iconMode !== null && faviconProviderUsesServerPreview(iconMode);

  const stored = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey,
    vaultId: item.vaultId,
    itemId: item.itemId,
    faviconId: item.faviconId,
    enabled: Boolean(item.faviconId && accessToken && vaultKey),
  });

  const clientFaviconSrc = useMemo(() => {
    if (iconMode !== "client" || item.categoryId !== ITEM_CATEGORY_LOGIN || item.faviconSource === "manual") {
      return undefined;
    }
    return clientSideFaviconUrlFromUrls(websiteUrls) ?? undefined;
  }, [iconMode, item.categoryId, item.faviconSource, websiteUrls]);

  const [apiPreviewSrc, setApiPreviewSrc] = useState<string | undefined>();
  const [apiLoading, setApiLoading] = useState(false);
  const apiPreviewBlobRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (apiPreviewBlobRef.current) {
        URL.revokeObjectURL(apiPreviewBlobRef.current);
        apiPreviewBlobRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (stored.imageSrc || item.faviconSource === "manual") {
      if (apiPreviewBlobRef.current) {
        URL.revokeObjectURL(apiPreviewBlobRef.current);
        apiPreviewBlobRef.current = null;
      }
      setApiPreviewSrc(undefined);
      setApiLoading(false);
      return;
    }
    if (!accessToken || !serverPreview || item.categoryId !== ITEM_CATEGORY_LOGIN || remoteUrls.length === 0) {
      if (apiPreviewBlobRef.current) {
        URL.revokeObjectURL(apiPreviewBlobRef.current);
        apiPreviewBlobRef.current = null;
      }
      setApiPreviewSrc(undefined);
      setApiLoading(false);
      return;
    }

    let cancelled = false;
    setApiLoading(true);
    void previewItemFavicon(accessToken, remoteUrls)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        if (apiPreviewBlobRef.current) {
          URL.revokeObjectURL(apiPreviewBlobRef.current);
          apiPreviewBlobRef.current = null;
        }
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          apiPreviewBlobRef.current = objectUrl;
          setApiPreviewSrc(objectUrl);
        } else {
          setApiPreviewSrc(undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiPreviewSrc(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setApiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, item.categoryId, item.faviconSource, remoteUrls, serverPreview, stored.imageSrc]);

  return {
    previewImageSrc: stored.imageSrc ?? apiPreviewSrc ?? clientFaviconSrc,
    previewLoading: stored.loading || apiLoading,
  };
}
