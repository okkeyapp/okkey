import type { Vault } from "@okkey/types";
import { Button, Spinner, type KeyFieldFileValue } from "@okkey/ui";
import { useMemo, useRef, useCallback, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { findWorkspaceFolderPathById } from "../../folders/workspaceFolderTree";
import { useItemsMobileListView } from "../../hooks/useItemsMobileListView";
import { useScrollAncestorScrolled } from "../../hooks/useRadixScrollAreaScrolled";
import {
  buildItemActivityEntries,
  enrichItemActivityWithItemTimestamps,
  mapItemActivityWireEntries,
} from "../../items/buildItemActivityEntries";
import { itemPlaintextToKeyFormSections } from "../../items/itemPlaintextToKeyFormSections";
import { patchItemRecoveryCodesField } from "../../items/patchItemRecoveryCodesField";
import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { formatTagSearchQuery } from "../../items/workspaceItemSearch";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../locale/LocaleContext";
import type { WorkspaceShellOutletContext } from "../../pages/workspace/WorkspaceSectionPage";
import {
  EDIT_ITEM_POPUP_ID,
  NEW_CAPSULE_POPUP_ID,
  NEW_ITEM_POPUP_ID,
  buildPopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { applyWorkspaceSearchToParams, itemsPathAllWorkspaceMerged, ITEM_QUERY_PARAM, withoutOpenItemQueryParam } from "../../routes/paths";
import type { ItemsListRecord } from "../workspace/ItemsListLeftPane";
import { KeyFormEditor, type RecoveryCodesValueChange } from "../key-form/KeyFormEditor";
import { createKeyFormEditorMessages, createLocalizedKeyFieldTypes, filterKeyFieldTypesForFilesEnabled } from "../key-form/keyFormI18n";
import { isItemCategoryId, itemCategoryIdToPopupSlug } from "./itemCategoryCatalog";
import ItemRecordFavicon from "./ItemRecordFavicon";
import ItemActivitySection from "./ItemActivitySection";
import ItemDetailBreadcrumbs from "./ItemDetailBreadcrumbs";
import ItemDetailTopBar from "./ItemDetailTopBar";
import DeleteItemsConfirmPopup from "./DeleteItemsConfirmPopup";
import { ItemsDetailPanelEmptyStateFill } from "./ItemsDetailPanelEmptyState";
import ItemTagsReadonly from "./ItemTagsReadonly";
import { downloadKeyFieldFileAttachment } from "../../api/key-field-files";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";
import { useWorkspaceMemberDisplayNames } from "../../workspace/useWorkspaceMemberDisplayNames";

type ItemDetailCardProps = {
  itemId: string;
  vaults: readonly Vault[];
  workspaceId?: string;
};

function actorLabelFromProfile(profile: { firstName?: string | null; lastName?: string | null; email?: string } | null): string {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  return profile?.email?.trim() || "—";
}

export default function ItemDetailCard({ itemId, vaults, workspaceId: workspaceIdProp }: ItemDetailCardProps) {
  const { t, locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isItemsMobileListView = useItemsMobileListView();
  const { accessToken, profile, userId } = useAuthVault();
  const outletContext = useOutletContext<WorkspaceShellOutletContext | undefined>();
  const workspaceId = workspaceIdProp ?? outletContext?.workspaceId;
  const { resolveMemberDisplayName } = useWorkspaceMemberDisplayNames(workspaceId);
  const { getItemById, getItemActivityById, getItemCreatedByUserId, bootstrapped, loading, records, syncVersion, setItemArchived, setItemDeleted, updateItemQuiet, deletedItemsRetentionDays, fileUploadConstraints, filesInItemsEnabled, resolveVaultEncryptionKey } =
    useWorkspaceItems();
  const {
    canPutItem,
    canDeleteItem,
    canUseFunction,
    canViewFieldType,
    canViewItem,
  } = useWorkspaceVaultProfiles();
  const { folderTree, setItemFavorite } = useWorkspaceFolders();
  const cardRootRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const createdByUserId = getItemCreatedByUserId(itemId);
  const vault = vaults.find((candidate) => candidate.id === (item?.vaultId ?? listRecord?.vaultId));
  const itemEncryptionKey = useResolvedVaultEncryptionKey(item?.vaultId ?? listRecord?.vaultId);
  const faviconId = item?.faviconId ?? listRecord?.faviconId;
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey: itemEncryptionKey,
    vaultId: item?.vaultId ?? listRecord?.vaultId,
    itemId: item?.itemId ?? listRecord?.id,
    faviconId,
    enabled: Boolean(itemEncryptionKey),
  });
  const folderId = listRecord?.folderId ?? null;
  const folderLabel = folderId
    ? findWorkspaceFolderPathById(folderTree, folderId) || folderId
    : t("web.newItemPopup.noFolder");

  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const formSections = useMemo(() => {
    if (!item) {
      return [];
    }
    const sections = itemPlaintextToKeyFormSections(item, keyFormMessages);
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => canViewFieldType(item.vaultId, field.type)),
      }))
      .filter((section) => section.fields.length > 0);
  }, [canViewFieldType, item, keyFormMessages]);
  const itemAccessAllowed =
    !item || canViewItem(item.vaultId, item.categoryId, createdByUserId);
  const vaultIdForPermits = item?.vaultId ?? listRecord?.vaultId ?? "";
  const canEdit = vaultIdForPermits ? canPutItem(vaultIdForPermits, createdByUserId) : false;
  // Archive is a profile function ("Помещать в архив"), not entries.archive (no UI column).
  const canArchive = vaultIdForPermits ? canUseFunction(vaultIdForPermits, "archive") : false;
  const canDelete = vaultIdForPermits ? canDeleteItem(vaultIdForPermits, createdByUserId) : false;
  const canFavorite = vaultIdForPermits ? canUseFunction(vaultIdForPermits, "favorite") : false;
  const canCreateCapsule = vaultIdForPermits ? canUseFunction(vaultIdForPermits, "create_capsules") : false;
  const canCopy = vaultIdForPermits ? canUseFunction(vaultIdForPermits, "save_to_personal") : false;
  const openCapsuleFromItem = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, NEW_CAPSULE_POPUP_ID, {
        capsuleFromItemId: itemId,
      }),
      hash: location.hash,
    });
  }, [itemId, location, navigate]);
  const keyFormFieldTypes = useMemo(
    () => filterKeyFieldTypesForFilesEnabled(createLocalizedKeyFieldTypes(locale), filesInItemsEnabled),
    [locale, filesInItemsEnabled],
  );
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
    async (file: KeyFieldFileValue) => {
      if (!accessToken || !item) {
        throw new Error("AUTH_REQUIRED");
      }
      const vaultKey =
        itemEncryptionKey ?? (await resolveVaultEncryptionKey(item.vaultId));
      return downloadKeyFieldFileAttachment({
        accessToken,
        vaultId: item.vaultId,
        itemId: item.itemId,
        vaultKey,
        file,
      });
    },
    [accessToken, item, itemEncryptionKey, resolveVaultEncryptionKey],
  );
  const activityEntries = useMemo(() => {
    if (!item) {
      return [];
    }
    const resolveActorLabel = (actorId: string | null) => {
      const fromMembers = resolveMemberDisplayName(actorId);
      if (fromMembers) {
        return fromMembers;
      }
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
      return enrichItemActivityWithItemTimestamps(
        mapItemActivityWireEntries(wireEntries, resolveActorLabel),
        item,
        resolveActorLabel(userId ?? null),
      );
    }
    return buildItemActivityEntries({
      itemId: item.itemId,
      createdAtMs: item.createdAtMs,
      updatedAtMs: item.updatedAtMs,
      actorLabel: resolveActorLabel(userId ?? null),
    });
  }, [item, profile, userId, getItemActivityById, resolveMemberDisplayName, syncVersion]);

  const handleToggleDelete = useCallback(() => {
    if (!canDelete && !(listRecord?.deleted ?? false)) {
      return;
    }
    const nextDeleted = !(listRecord?.deleted ?? false);
    if (!nextDeleted) {
      void (async () => {
        await setItemDeleted(itemId, false);
      })();
      return;
    }
    setDeleteConfirmOpen(true);
  }, [canDelete, itemId, listRecord?.deleted, setItemDeleted]);

  const confirmDeleteItem = useCallback(() => {
    void (async () => {
      await setItemDeleted(itemId, true);
      setSearchParams((prev) => withoutOpenItemQueryParam(prev, [itemId]), { replace: true });
      if (listRecord?.favorite) {
        await setItemFavorite(itemId, false);
      }
      if (listRecord?.archived) {
        await setItemArchived(itemId, false);
      }
      setDeleteConfirmOpen(false);
    })();
  }, [itemId, listRecord?.archived, listRecord?.favorite, setItemArchived, setItemDeleted, setItemFavorite, setSearchParams]);

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

  if (!itemAccessAllowed) {
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
    if (!canEdit) {
      return;
    }
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
    if (!item || !isItemCategoryId(item.categoryId)) {
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
        itemId={itemId}
        folderId={folderId}
        folderLabel={folderLabel}
        favorite={listRecord?.favorite ?? false}
        archived={listRecord?.archived ?? false}
        deleted={listRecord?.deleted ?? false}
        headerScrolled={headerScrolled}
        showBack={isItemsMobileListView}
        onBack={handleBack}
        onEdit={openEditPopup}
        onCopy={canCopy ? openCopyPopup : undefined}
        canEdit={canEdit}
        canFavorite={canFavorite}
        canArchive={canArchive}
        canDelete={canDelete}
        canCreateCapsule={canCreateCapsule}
        onCreateCapsule={openCapsuleFromItem}
        onToggleFavorite={() => {
          if (!canFavorite) {
            return;
          }
          void setItemFavorite(itemId, !(listRecord?.favorite ?? false));
        }}
        onToggleArchive={() => {
          if (!canArchive || listRecord?.deleted) {
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
        onToggleDelete={handleToggleDelete}
      />

      <DeleteItemsConfirmPopup
        open={deleteConfirmOpen}
        multiple={false}
        retentionDays={deletedItemsRetentionDays}
        t={t}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteItem}
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
            fileUploadConstraints={fileUploadConstraints}
          />

          {(item.tags ?? []).length > 0 ? (
            <ItemTagsReadonly t={t} tags={item.tags ?? []} onTagClick={handleTagClick} />
          ) : null}

          <ItemDetailBreadcrumbs
            t={t}
            vault={vault}
            itemId={itemId}
            folderId={folderId}
            folderLabel={folderLabel}
            canChangeFolder={!(listRecord?.deleted ?? false)}
            className="-mr-1 pt-4 md:hidden"
          />

          <ItemActivitySection key={`activity-${itemId}`} t={t} entries={activityEntries} />
        </div>
      </div>
    </div>
  );
}
