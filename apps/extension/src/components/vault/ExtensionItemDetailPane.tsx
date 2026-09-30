import type { ItemPlaintextV2, Vault } from "@okkey/types";
import {
  ItemsDetailPanelEmptyStateFill,
  ItemDetailActionsBar,
  ScrollArea,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { downloadKeyFieldFileAttachment, copyTextWithVaultClipboardPolicy } from "@okkey/vault";
import {
  DeleteItemsConfirmPopup,
  ItemActivitySection,
  ItemDetailSavePath,
  ItemRecordFavicon,
  KeyFormEditor,
  buildItemActivityEntries,
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
  filterKeyFieldTypesForFilesEnabled,
  itemPlaintextToKeyFormSections,
  useItemFaviconAttachmentUrl,
  type KeyFormEditorMessages,
} from "@okkey/vault-ui";
import { useCallback, useMemo, useRef, useState } from "react";
import type { WebLocale } from "@okkey/i18n";

import { readExtensionDevicePrefs } from "../../lib/extensionVaultSession";
import { useRadixScrollAreaScrolled } from "../../lib/useRadixScrollAreaScrolled";

type ExtensionItemDetailPaneProps = {
  item: ItemPlaintextV2;
  vault?: Vault;
  folderLabel: string;
  actorLabel: string;
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array | null | undefined;
  locale: WebLocale;
  userId: string;
  favorite: boolean;
  canFavorite: boolean;
  canDelete: boolean;
  canArchive: boolean;
  deletedItemsRetentionDays: number;
  mutationBusy?: boolean;
  onEdit: () => void;
  onCreateCapsule: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onToggleDelete: (deleted: boolean) => void | Promise<void>;
  onOpenInWeb: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

/**
 * Extension detail pane — same composition as web ItemDetailCard.
 * Favorite / soft-delete run locally (E3); archive still deep-links when not wired.
 */
export function ExtensionItemDetailPane(props: ExtensionItemDetailPaneProps) {
  const {
    item,
    vault,
    folderLabel,
    actorLabel,
    apiBaseUrl,
    accessToken,
    vaultKey,
    locale,
    userId,
    favorite,
    canFavorite,
    canDelete,
    canArchive,
    deletedItemsRetentionDays,
    mutationBusy = false,
    onEdit,
    onCreateCapsule,
    onToggleFavorite,
    onToggleArchive,
    onToggleDelete,
    onOpenInWeb,
    t,
  } = props;

  const detailScrollRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useRadixScrollAreaScrolled(detailScrollRef);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archived = item.archived ?? false;
  const deleted = item.deleted ?? false;

  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const formSections = useMemo(
    () => itemPlaintextToKeyFormSections(item, keyFormMessages),
    [item, keyFormMessages],
  );
  const keyFormFieldTypes = useMemo(
    () => filterKeyFieldTypesForFilesEnabled(createLocalizedKeyFieldTypes(locale), true),
    [locale],
  );

  const faviconUrl = useItemFaviconAttachmentUrl({
    apiBaseUrl,
    accessToken,
    vaultKey,
    vaultId: item.vaultId,
    itemId: item.itemId,
    faviconId: item.faviconId,
    enabled: Boolean(vaultKey && item.faviconId),
  });

  const messagesWithCopy = useMemo((): KeyFormEditorMessages => {
    return {
      ...keyFormMessages,
      copy: t("extension.vault.copy"),
      copied: t("extension.vault.copied"),
    };
  }, [keyFormMessages, t]);

  const activityEntries = useMemo(
    () =>
      buildItemActivityEntries({
        itemId: item.itemId,
        createdAtMs: item.createdAtMs,
        updatedAtMs: item.updatedAtMs,
        actorLabel,
      }),
    [actorLabel, item.createdAtMs, item.itemId, item.updatedAtMs],
  );

  const handleFileOpen = useCallback(
    async (file: KeyFieldFileValue) => {
      if (!vaultKey) {
        throw new Error("VAULT_KEY_REQUIRED");
      }
      return downloadKeyFieldFileAttachment({
        apiBaseUrl,
        accessToken,
        vaultId: item.vaultId,
        itemId: item.itemId,
        vaultKey,
        file,
      });
    },
    [accessToken, apiBaseUrl, item.itemId, item.vaultId, vaultKey],
  );

  const handleCopyAction = useCallback(
    async (text: string) => {
      const prefs = await readExtensionDevicePrefs(userId);
      await copyTextWithVaultClipboardPolicy({
        clipboardClearSeconds: prefs.clipboardClearSeconds,
        text,
      });
    },
    [userId],
  );

  const handleToggleDelete = useCallback(() => {
    if (!canDelete || mutationBusy) {
      return;
    }
    if (deleted) {
      void onToggleDelete(false);
      return;
    }
    setDeleteConfirmOpen(true);
  }, [canDelete, deleted, mutationBusy, onToggleDelete]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ItemDetailActionsBar
        t={t}
        favorite={favorite}
        archived={archived}
        deleted={deleted}
        headerScrolled={headerScrolled}
        showBack={false}
        onEdit={onEdit}
        onToggleFavorite={() => {
          if (!canFavorite || mutationBusy) {
            return;
          }
          onToggleFavorite();
        }}
        onToggleArchive={() => {
          if (!canArchive || deleted || mutationBusy) {
            return;
          }
          onToggleArchive();
        }}
        onToggleDelete={handleToggleDelete}
        onCreateCapsule={onCreateCapsule}
        canEdit={!archived && !deleted && !mutationBusy}
        canFavorite={!archived && !deleted && canFavorite && !mutationBusy}
        canArchive={!deleted && canArchive && !mutationBusy}
        canDelete={canDelete && !mutationBusy}
        canCreateCapsule={!archived && !deleted}
        openInWebLabel={t("extension.vault.openInWeb")}
        onOpenInWeb={onOpenInWeb}
      />

      <ScrollArea ref={detailScrollRef} className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[600px] flex-1 px-4 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <ItemRecordFavicon
                categoryId={item.categoryId}
                title={item.title}
                faviconId={item.faviconId}
                previewImageSrc={faviconUrl.imageSrc}
                previewLoading={faviconUrl.loading}
                size={40}
                alt=""
              />
              <h1 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">
                {item.title || "—"}
              </h1>
            </div>

            <KeyFormEditor
              key={item.itemId}
              mode="view"
              initialSections={formSections}
              fieldTypes={keyFormFieldTypes}
              messages={messagesWithCopy}
              onFileOpen={handleFileOpen}
              onCopyText={handleCopyAction}
            />

            <ItemDetailSavePath vault={vault} folderLabel={folderLabel} />

            <ItemActivitySection
              key={`activity-${item.itemId}`}
              t={t}
              locale={locale}
              entries={activityEntries}
            />
          </div>
        </div>
      </ScrollArea>

      <DeleteItemsConfirmPopup
        open={deleteConfirmOpen}
        multiple={false}
        retentionDays={deletedItemsRetentionDays}
        deleting={deleting}
        t={t}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void (async () => {
            setDeleting(true);
            try {
              await onToggleDelete(true);
              setDeleteConfirmOpen(false);
            } finally {
              setDeleting(false);
            }
          })();
        }}
      />
    </div>
  );
}

export function ExtensionItemDetailEmpty(props: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative min-h-0 flex-1">
      <ItemsDetailPanelEmptyStateFill title={props.title} description={props.description} />
    </div>
  );
}
