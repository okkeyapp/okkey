import type { ItemPlaintextV2, Vault } from "@okkey/types";
import {
  ItemsDetailPanelEmptyStateFill,
  ItemDetailActionsBar,
  ScrollArea,
  type KeyFieldFileValue,
} from "@okkey/ui";
import type { WorkspaceFolderNode } from "@okkey/vault";
import { downloadKeyFieldFileAttachment, copyTextWithVaultClipboardPolicy } from "@okkey/vault";
import {
  DeleteItemsConfirmPopup,
  ItemActivitySection,
  ItemDetailSavePath,
  ItemRecordFavicon,
  KeyFormEditor,
  buildItemActivityEntries,
  enrichItemActivityWithItemTimestamps,
  mapItemActivityWireEntries,
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
  filterKeyFieldTypesForFilesEnabled,
  itemPlaintextToKeyFormSections,
  useItemFaviconAttachmentUrl,
  type ItemActivityWireEntry,
  type KeyFormEditorMessages,
} from "@okkey/vault-ui";
import { useCallback, useMemo, useRef, useState } from "react";
import type { WebLocale } from "@okkey/i18n";

import { readExtensionDevicePrefs } from "../../lib/extensionVaultSession";
import { useRadixScrollAreaScrolled } from "../../lib/useRadixScrollAreaScrolled";
import { ExtensionItemFolderAssignControl } from "./ExtensionItemFolderAssignControl";

type ExtensionItemDetailPaneProps = {
  item: ItemPlaintextV2;
  vault?: Vault;
  folderId: string | null;
  folderLabel: string;
  folderNodes: readonly WorkspaceFolderNode[];
  actorLabel: string;
  activityWireEntries?: readonly ItemActivityWireEntry[];
  apiBaseUrl: string;
  accessToken: string;
  vaultKey: Uint8Array | null | undefined;
  locale: WebLocale;
  userId: string;
  favorite: boolean;
  canFavorite: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canChangeFolder?: boolean;
  deletedItemsRetentionDays: number;
  onEdit: () => void;
  onCreateCapsule: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onToggleDelete: (deleted: boolean) => void | Promise<void>;
  onAssignFolder: (folderId: string | null) => Promise<void>;
  onCreateFolder: (label: string) => Promise<string>;
  onOpenInWeb: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

/**
 * Extension detail pane — same composition as web ItemDetailCard.
 * Favorite / archive / soft-delete run locally (E3).
 */
export function ExtensionItemDetailPane(props: ExtensionItemDetailPaneProps) {
  const {
    item,
    vault,
    folderId,
    folderLabel,
    folderNodes,
    actorLabel,
    activityWireEntries = [],
    apiBaseUrl,
    accessToken,
    vaultKey,
    locale,
    userId,
    favorite,
    canFavorite,
    canDelete,
    canArchive,
    canChangeFolder = true,
    deletedItemsRetentionDays,
    onEdit,
    onCreateCapsule,
    onToggleFavorite,
    onToggleArchive,
    onToggleDelete,
    onAssignFolder,
    onCreateFolder,
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

  const activityEntries = useMemo(() => {
    if (activityWireEntries.length > 0) {
      return enrichItemActivityWithItemTimestamps(
        mapItemActivityWireEntries(activityWireEntries, () => actorLabel),
        item,
        actorLabel,
      );
    }
    return buildItemActivityEntries({
      itemId: item.itemId,
      createdAtMs: item.createdAtMs,
      updatedAtMs: item.updatedAtMs,
      actorLabel,
    });
  }, [activityWireEntries, actorLabel, item]);

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
    if (!canDelete) {
      return;
    }
    if (deleted) {
      void onToggleDelete(false);
      return;
    }
    setDeleteConfirmOpen(true);
  }, [canDelete, deleted, onToggleDelete]);

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
          if (!canFavorite) {
            return;
          }
          onToggleFavorite();
        }}
        onToggleArchive={() => {
          if (!canArchive || deleted) {
            return;
          }
          onToggleArchive();
        }}
        onToggleDelete={handleToggleDelete}
        onCreateCapsule={onCreateCapsule}
        canEdit={!archived && !deleted}
        canFavorite={!archived && !deleted && canFavorite}
        canArchive={!deleted && canArchive}
        canDelete={canDelete}
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

            <ItemDetailSavePath
              vault={vault}
              folderLabel={folderLabel}
              trailing={
                canChangeFolder && !deleted ? (
                  <ExtensionItemFolderAssignControl
                    t={t}
                    folderId={folderId}
                    folderNodes={folderNodes}
                    onAssign={onAssignFolder}
                    onCreateFolder={onCreateFolder}
                  />
                ) : null
              }
            />

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
