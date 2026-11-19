import type { WebMessageValues } from "@okkey/i18n";
import { clearLinkedAccountItemId, resolveLinkedAccountItem } from "@okkey/vault-ui";
import { Button, cn, mutedSurfaceHoverBgClassName } from "@okkey/ui";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useClientWebsiteIconSrc } from "../../items/faviconMode";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { ITEM_QUERY_PARAM } from "../../routes/paths";
import ItemRecordFavicon from "./ItemRecordFavicon";

type ItemSignInWithDetailProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  itemId: string;
  linkedAccountItemId: string | undefined;
  canEdit: boolean;
};

export default function ItemSignInWithDetail({
  t,
  itemId,
  linkedAccountItemId,
  canEdit,
}: ItemSignInWithDetailProps) {
  const { accessToken } = useAuthVault();
  const { getItemById, updateItemQuiet, records } = useWorkspaceItems();
  const [, setSearchParams] = useSearchParams();
  const [clearing, setClearing] = useState(false);

  const resolution = useMemo(
    () => resolveLinkedAccountItem(linkedAccountItemId, getItemById),
    [getItemById, linkedAccountItemId],
  );

  const linkedListRecord = useMemo(() => {
    if (resolution.status !== "ok") {
      return undefined;
    }
    return (records ?? []).find((record) => record.id === resolution.item.itemId);
  }, [records, resolution]);

  const linkedItem = resolution.status === "ok" ? resolution.item : undefined;
  const linkedEncryptionKey = useResolvedVaultEncryptionKey(linkedItem?.vaultId);
  const linkedFaviconId = linkedItem?.faviconId ?? linkedListRecord?.faviconId;
  const linkedWebsiteUrls = useMemo(() => {
    if (linkedItem) {
      return linkedItem.fields
        .filter((field) => field.type === "url" && field.value.kind === "url")
        .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
        .filter((url) => url.length > 0);
    }
    return linkedListRecord?.urls ?? [];
  }, [linkedItem, linkedListRecord?.urls]);
  const clientIconSrc = useClientWebsiteIconSrc(linkedWebsiteUrls, !linkedFaviconId);
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey: linkedEncryptionKey,
    vaultId: linkedItem?.vaultId ?? linkedListRecord?.vaultId,
    itemId: linkedItem?.itemId ?? linkedListRecord?.id,
    faviconId: linkedFaviconId,
    enabled: Boolean(linkedEncryptionKey && linkedFaviconId),
  });

  const openLinkedItem = useCallback(() => {
    if (resolution.status !== "ok") {
      return;
    }
    const targetId = resolution.item.itemId;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ITEM_QUERY_PARAM, targetId);
        return next;
      },
      { replace: false },
    );
  }, [resolution, setSearchParams]);

  const handleClear = useCallback(async () => {
    const current = getItemById(itemId);
    if (!current?.linkedAccountItemId || clearing) {
      return;
    }
    setClearing(true);
    try {
      await updateItemQuiet(clearLinkedAccountItemId(current));
    } finally {
      setClearing(false);
    }
  }, [clearing, getItemById, itemId, updateItemQuiet]);

  if (resolution.status === "none") {
    return null;
  }

  if (resolution.status === "lost") {
    return (
      <div className="flex flex-wrap items-center gap-3 py-2">
        <span className="shrink-0 text-sm font-medium text-foreground">
          {t("web.newItemPopup.signInWith.label")}
        </span>
        <span className="text-sm text-muted-foreground">{t("web.items.detail.signInWith.linkLost")}</span>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={clearing}
            onClick={() => {
              void handleClear();
            }}
          >
            {t("web.items.detail.signInWith.clear")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <span className="shrink-0 text-sm font-medium text-foreground">
        {t("web.newItemPopup.signInWith.label")}
      </span>
      <button
        type="button"
        onClick={openLinkedItem}
        className={cn(
          "inline-flex min-w-0 max-w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          mutedSurfaceHoverBgClassName,
        )}
        aria-label={t("web.items.detail.signInWith.openAria", { title: resolution.item.title })}
      >
        <ItemRecordFavicon
          categoryId="login"
          title={resolution.item.title}
          faviconId={linkedFaviconId}
          previewImageSrc={faviconUrl.imageSrc ?? clientIconSrc}
          previewLoading={faviconUrl.loading}
          size={20}
          alt=""
        />
        <span className="min-w-0 truncate font-medium">{resolution.item.title}</span>
      </button>
    </div>
  );
}
