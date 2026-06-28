import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
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
      const item = buildItemFromNewItemSavePayload(payload);
      const itemId = await createItem(item);
      if (payload.folderId !== NO_FOLDER_VALUE) {
        await assignItemToFolder(itemId, payload.folderId);
      }
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
        { replace: false },
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
      panelClassName="min-h-[720px]"
      footer={
        selectedCategoryId ? (
          <>
            <Button type="button" variant="outline" onClick={closePopup} disabled={saving}>
              {t("web.newItemPopup.cancel")}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t("web.newItemPopup.saving") : t("web.newItemPopup.save")}
            </Button>
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
