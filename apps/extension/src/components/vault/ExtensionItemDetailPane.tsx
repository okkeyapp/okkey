import type { ItemPlaintextV2, Vault } from "@okkey/types";
import {
  ItemsDetailPanelEmptyStateFill,
  ItemDetailActionsBar,
  ScrollArea,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { downloadKeyFieldFileAttachment } from "@okkey/vault";
import {
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
import { useCallback, useMemo, useRef } from "react";
import type { WebLocale } from "@okkey/i18n";

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
  onEdit: () => void;
  onCreateCapsule: () => void;
  onFavoriteInWeb: () => void;
  onArchiveInWeb: () => void;
  onDeleteInWeb: () => void;
  onOpenInWeb: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

/**
 * Extension detail pane — same composition as web ItemDetailCard:
 * ItemDetailActionsBar (no back) + favicon/title + full KeyFormEditor view mode
 * + save-path trail + activity footer.
 * Mutations deep-link to web; file fields open via local decrypt → blob URL.
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
    onEdit,
    onCreateCapsule,
    onFavoriteInWeb,
    onArchiveInWeb,
    onDeleteInWeb,
    onOpenInWeb,
    t,
  } = props;

  const detailScrollRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useRadixScrollAreaScrolled(detailScrollRef);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ItemDetailActionsBar
        t={t}
        favorite={false}
        archived={archived}
        deleted={deleted}
        headerScrolled={headerScrolled}
        showBack={false}
        onEdit={onEdit}
        onToggleFavorite={onFavoriteInWeb}
        onToggleArchive={onArchiveInWeb}
        onToggleDelete={onDeleteInWeb}
        onCreateCapsule={onCreateCapsule}
        canEdit={!archived && !deleted}
        canFavorite={!archived && !deleted}
        canArchive={!deleted}
        canDelete
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
