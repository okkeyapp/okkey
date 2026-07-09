import type { Vault } from "@okkey/types";
import { Button, Spinner, type KeyFieldFileValue } from "@okkey/ui";
import { useMemo, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { findWorkspaceFolderPathById } from "../../folders/workspaceFolderTree";
import { useItemsMobileListView } from "../../hooks/useItemsMobileListView";
import { useScrollAncestorScrolled } from "../../hooks/useRadixScrollAreaScrolled";
import {
  buildItemActivityEntries,
  mapItemActivityWireEntries,
} from "../../items/buildItemActivityEntries";
import { itemPlaintextToKeyFormSections } from "../../items/itemPlaintextToKeyFormSections";
import { patchItemRecoveryCodesField } from "../../items/patchItemRecoveryCodesField";
import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { formatTagSearchQuery } from "../../items/workspaceItemSearch";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useLocale } from "../../locale/LocaleContext";
import {
  EDIT_ITEM_POPUP_ID,
  NEW_ITEM_POPUP_ID,
  buildPopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { applyWorkspaceSearchToParams, itemsPathAllWorkspaceMerged, ITEM_QUERY_PARAM } from "../../routes/paths";
import type { ItemsListRecord } from "../workspace/ItemsListLeftPane";
import { KeyFormEditor, type RecoveryCodesValueChange } from "../key-form/KeyFormEditor";
import { createKeyFormEditorMessages, createLocalizedKeyFieldTypes } from "../key-form/keyFormI18n";
import { getItemCategoryDefinition, isItemCategoryId, itemCategoryIdToPopupSlug } from "./itemCategoryCatalog";
import ItemRecordFavicon from "./ItemRecordFavicon";
import ItemActivitySection from "./ItemActivitySection";
import ItemDetailBreadcrumbs from "./ItemDetailBreadcrumbs";
import ItemDetailTopBar from "./ItemDetailTopBar";
import { ItemsDetailPanelEmptyStateFill } from "./ItemsDetailPanelEmptyState";
import ItemTagsReadonly from "./ItemTagsReadonly";
import { downloadKeyFieldFileAttachment } from "../../api/key-field-files";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";

type ItemDetailCardProps = {
  itemId: string;
  vaults: readonly Vault[];
};

function actorLabelFromProfile(profile: { firstName?: string | null; lastName?: string | null; email?: string } | null): string {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  return profile?.email?.trim() || "—";
}

export default function ItemDetailCard({ itemId, vaults }: ItemDetailCardProps) {
  const { t, locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isItemsMobileListView = useItemsMobileListView();
  const { accessToken, profile, userId, vaultKey } = useAuthVault();
  const { getItemById, getItemActivityById, bootstrapped, loading, records, syncVersion, setItemArchived, setItemDeleted, updateItemQuiet } =
    useWorkspaceItems();
  const { folderTree, setItemFavorite } = useWorkspaceFolders();
  const cardRootRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useScrollAncestorScrolled(
    cardRootRef,
    0,
    `${itemId}:${bootstrapped}:${loading}`,
  );

  const item = getItemById(itemId);
  const listRecord = useMemo(
    () => records.find((record: ItemsListRecord) => record.id === itemId),
    [records, itemId],
  );
  const vault = vaults.find((candidate) => candidate.id === (item?.vaultId ?? listRecord?.vaultId));
  const faviconId = item?.faviconId ?? listRecord?.faviconId;
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey,
    vaultId: item?.vaultId ?? listRecord?.vaultId,
    itemId: item?.itemId ?? listRecord?.id,
    faviconId,
    enabled: vault?.isPersonal,
  });
  const folderId = listRecord?.folderId ?? null;
  const folderLabel = folderId
    ? findWorkspaceFolderPathById(folderTree, folderId) || folderId
    : t("web.newItemPopup.noFolder");

  const category = item && isItemCategoryId(item.categoryId) ? getItemCategoryDefinition(item.categoryId) : undefined;
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const formSections = useMemo(
    () => (item ? itemPlaintextToKeyFormSections(item, keyFormMessages) : []),
    [item, keyFormMessages],
  );
  const keyFormFieldTypes = useMemo(() => createLocalizedKeyFieldTypes(locale), [locale]);
  const handleRecoveryCodesValueChange = useCallback(
    async ({ fieldId, value }: RecoveryCodesValueChange) => {
      const currentItem = getItemById(itemId);
      if (!currentItem) {
        return;
      }

      await updateItemQuiet(patchItemRecoveryCodesField(currentItem, fieldId, value));
    },
    [getItemById, itemId, updateItemQuiet],
  );
  const handleFileOpen = useCallback(
    (file: KeyFieldFileValue) => {
      if (!accessToken || !vaultKey || !item || !vault?.isPersonal) {
        throw new Error("SHARED_VAULT_KEY_UNWRAP_UNSUPPORTED");
      }
      return downloadKeyFieldFileAttachment({
        accessToken,
        vaultId: item.vaultId,
        itemId: item.itemId,
        vaultKey,
        file,
      });
    },
    [accessToken, item, vault?.isPersonal, vaultKey],
  );
  const activityEntries = useMemo(() => {
    if (!item) {
      return [];
    }
    const resolveActorLabel = (actorId: string | null) => {
      if (actorId && userId && actorId === userId) {
        return actorLabelFromProfile(profile);
      }
      if (actorId) {
        return actorId;
      }
      return actorLabelFromProfile(profile);
    };
    const wireEntries = getItemActivityById(item.itemId);
    if (wireEntries.length > 0) {
      return mapItemActivityWireEntries(wireEntries, resolveActorLabel);
    }
    return buildItemActivityEntries({
      itemId: item.itemId,
      createdAtMs: item.createdAtMs,
      updatedAtMs: item.updatedAtMs,
      actorLabel: actorLabelFromProfile(profile),
    });
  }, [item, profile, userId, getItemActivityById, syncVersion]);

  if (!bootstrapped || loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!item) {
    return (
      <ItemsDetailPanelEmptyStateFill
        title={t("web.items.detail.notFoundTitle")}
        description={t("web.items.detail.notFound")}
        action={
          <Button asChild variant="secondary">
            <Link to={itemsPathAllWorkspaceMerged(searchParams, { clearItem: true })}>{t("web.nav.allItems")}</Link>
          </Button>
        }
      />
    );
  }

  function openEditPopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_ITEM_POPUP_ID, itemId)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function openCopyPopup() {
    if (!isItemCategoryId(item.categoryId)) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID, itemCategoryIdToPopupSlug(item.categoryId)), {
          copyFromItemId: itemId,
        }),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function handleBack() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(ITEM_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }

  function handleTagClick(tag: string) {
    setSearchParams(
      (prev) =>
        applyWorkspaceSearchToParams(prev, formatTagSearchQuery(tag), {
          clearItem: isItemsMobileListView,
        }),
      { replace: true },
    );
  }

  return (
    <div ref={cardRootRef} className="flex min-h-full flex-col">
      <ItemDetailTopBar
        t={t}
        vault={vault}
        folderId={folderId}
        folderLabel={folderLabel}
        favorite={listRecord?.favorite ?? false}
        archived={listRecord?.archived ?? false}
        deleted={listRecord?.deleted ?? false}
        headerScrolled={headerScrolled}
        showBack={isItemsMobileListView}
        onBack={handleBack}
        onEdit={openEditPopup}
        onCopy={openCopyPopup}
        onToggleFavorite={() => {
          void setItemFavorite(itemId, !(listRecord?.favorite ?? false));
        }}
        onToggleArchive={() => {
          if (listRecord?.deleted) {
            return;
          }
          const nextArchived = !(listRecord?.archived ?? false);
          void (async () => {
            await setItemArchived(itemId, nextArchived);
            if (nextArchived && listRecord?.favorite) {
              await setItemFavorite(itemId, false);
            }
          })();
        }}
        onToggleDelete={() => {
          const nextDeleted = !(listRecord?.deleted ?? false);
          void (async () => {
            await setItemDeleted(itemId, nextDeleted);
            if (nextDeleted) {
              if (listRecord?.favorite) {
                await setItemFavorite(itemId, false);
              }
              if (listRecord?.archived) {
                await setItemArchived(itemId, false);
              }
            }
          })();
        }}
      />

      <div className="mx-auto w-full max-w-[600px] flex-1 px-4 py-6 md:py-[36px]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ItemRecordFavicon
              categoryId={item.categoryId}
              title={item.title}
              faviconId={faviconId}
              previewImageSrc={faviconUrl.imageSrc}
              previewLoading={faviconUrl.loading}
              size={40}
              alt=""
            />
            <h1 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">{item.title}</h1>
          </div>

          <KeyFormEditor
            key={item.itemId}
            mode="view"
            initialSections={formSections}
            fieldTypes={keyFormFieldTypes}
            messages={keyFormMessages}
            datePickerLocale={datePickerLocale}
            onRecoveryCodesValueChange={handleRecoveryCodesValueChange}
            onFileOpen={handleFileOpen}
          />

          {(item.tags ?? []).length > 0 ? (
            <ItemTagsReadonly t={t} tags={item.tags ?? []} onTagClick={handleTagClick} />
          ) : null}

          <ItemDetailBreadcrumbs
            vault={vault}
            folderId={folderId}
            folderLabel={folderLabel}
            className="-mr-1 pt-4 md:hidden"
          />

          <ItemActivitySection t={t} entries={activityEntries} />
        </div>
      </div>
    </div>
  );
}
