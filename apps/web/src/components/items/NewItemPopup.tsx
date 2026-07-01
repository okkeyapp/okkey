import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { deleteDevKeyFieldFile } from "../../api/key-field-files";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { deleteRemovedKeyFieldFiles } from "../../items/keyFieldFileAttachments";
import { syncItemFaviconForPlaintext } from "../../items/syncItemFavicon";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { runSaveWithToast } from "../../lib/saveWithToast";
import PopupSaveButton from "../ui/PopupSaveButton";
import { buildItemFromNewItemSavePayload } from "./NewItemForm";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import {
  NEW_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { ITEM_QUERY_PARAM } from "../../routes/paths";
import { getItemCategoryDefinition, isItemCategoryId } from "./itemCategoryCatalog";
import { getCategoryLabel } from "./NewItemCategoryCard";
import NewItemCategoryPicker from "./NewItemCategoryPicker";
import NewItemForm, { type NewItemFormHandle } from "./NewItemForm";
import { BackChevronIcon } from "./itemCategoryIcons";
import { useItemCategoryPreferences } from "./useItemCategoryPreferences";

type NewItemPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function NewItemPopup({ t, workspaceId, workspaceName, vaults, vaultsListReady }: NewItemPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === NEW_ITEM_POPUP_ID;
  const selectedCategoryId =
    open && activePopup.menuItemId && isItemCategoryId(activePopup.menuItemId)
      ? activePopup.menuItemId
      : null;

  const formRef = useRef<NewItemFormHandle>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { createItem } = useWorkspaceItems();
  const { assignItemToFolder } = useWorkspaceFolders();
  const { accessToken } = useAuthVault();

  const { favoriteIds, favoriteIdSet, ready, toggleFavorite, reorderFavorites } =
    useItemCategoryPreferences(workspaceId);

  function closePopup() {
    setShowValidation(false);
    setSaveError(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function selectCategory(categoryId: string) {
    setShowValidation(false);
    setSaveError(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID, categoryId)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function backToCategories() {
    setShowValidation(false);
    setSaveError(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  async function handleSave() {
    const validation = formRef.current?.validate();
    if (!validation?.ok) {
      setShowValidation(true);
      return;
    }
    const payload = formRef.current?.getSavePayload();
    if (!payload) {
      setShowValidation(true);
      return;
    }

    const selectedVault = vaults.find((vault) => vault.id === payload.vaultId);
    if (selectedVault && !selectedVault.isPersonal) {
      setSaveError(t("web.newItemPopup.saveErrorSharedVaultUnsupported"));
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const itemId = await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.newItemPopup.saveErrorGeneric"),
        },
        async () => {
          if (!accessToken) {
            throw new Error("AUTH_REQUIRED");
          }
          let item = buildItemFromNewItemSavePayload(payload);
          item = await syncItemFaviconForPlaintext(accessToken, item);
          const createdItemId = await createItem(item);
          await deleteRemovedKeyFieldFiles(
            formRef.current?.getFileBaselineSections() ?? [],
            formRef.current?.getCurrentSections() ?? payload.sections,
            deleteDevKeyFieldFile,
          );
          if (payload.folderId !== NO_FOLDER_VALUE) {
            await assignItemToFolder(createdItemId, payload.folderId);
          }
          return createdItemId;
        },
      );
      const params = new URLSearchParams(location.search);
      params.delete(POPUP_QUERY_PARAM);
      params.set(ITEM_QUERY_PARAM, itemId);
      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash,
        },
        { replace: true },
      );
      setShowValidation(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("web.newItemPopup.saveErrorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  const selectedCategory = selectedCategoryId ? getItemCategoryDefinition(selectedCategoryId) : null;
  const selectedCategoryLabel = selectedCategory ? getCategoryLabel(t, selectedCategory) : null;

  const header = selectedCategoryId ? (
    <div className="flex min-w-0 items-center gap-2.5">
      <Button
        type="button"
        variant="secondary"
        size="iconSm"
        className="!size-7 !min-h-7 !min-w-7 shrink-0 rounded-md"
        aria-label={t("web.newItemPopup.backToCategories")}
        onClick={backToCategories}
      >
        <BackChevronIcon />
      </Button>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-7 text-foreground">
        {t("web.newItemPopup.newRecordTitle", { category: selectedCategoryLabel ?? selectedCategoryId })}
      </h2>
    </div>
  ) : (
    t("web.items.createRecord")
  );

  return (
    <Popup
      id={NEW_ITEM_POPUP_ID}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      closeDisabled={saving}
      panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
      footer={
        selectedCategoryId ? (
          <>
            <Button type="button" variant="outline" onClick={closePopup} disabled={saving}>
              {t("web.newItemPopup.cancel")}
            </Button>
            <PopupSaveButton
              saving={saving}
              saveLabel={t("web.newItemPopup.save")}
              savingLabel={t("web.newItemPopup.saving")}
              onClick={() => void handleSave()}
            />
          </>
        ) : (
          <Button type="button" variant="outline" onClick={closePopup}>
            {t("web.newItemPopup.cancel")}
          </Button>
        )
      }
    >
      {saveError ? <p className="mb-4 text-sm text-destructive">{saveError}</p> : null}
      {selectedCategoryId ? (
        <NewItemForm
          ref={formRef}
          t={t}
          categoryId={selectedCategoryId}
          workspaceName={workspaceName}
          vaults={vaults}
          vaultsListReady={vaultsListReady}
          showValidation={showValidation}
        />
      ) : (
        <NewItemCategoryPicker
          t={t}
          favoriteIds={favoriteIds}
          favoriteIdSet={favoriteIdSet}
          ready={ready}
          onToggleFavorite={toggleFavorite}
          onReorderFavorites={reorderFavorites}
          onSelectCategory={selectCategory}
        />
      )}
    </Popup>
  );
}
