import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { deleteDevKeyFieldFile } from "../../api/key-field-files";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { deleteRemovedKeyFieldFiles } from "../../items/keyFieldFileAttachments";
import { itemPlaintextToKeyFormSections } from "../../items/itemPlaintextToKeyFormSections";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { runSaveWithToast } from "../../lib/saveWithToast";
import PopupSaveButton from "../ui/PopupSaveButton";
import {
  EDIT_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { isItemCategoryId } from "./itemCategoryCatalog";
import NewItemForm, {
  buildItemFromEditSavePayload,
  type NewItemFormHandle,
  type NewItemFormInitialValues,
} from "./NewItemForm";

type EditItemPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function EditItemPopup({ t, workspaceName, vaults, vaultsListReady }: EditItemPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === EDIT_ITEM_POPUP_ID;
  const itemId = open ? activePopup.menuItemId?.trim() ?? "" : "";

  const formRef = useRef<NewItemFormHandle>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { getItemById, updateItem } = useWorkspaceItems();
  const { assignItemToFolder, itemFolderByItemId } = useWorkspaceFolders();

  const item = itemId ? getItemById(itemId) : undefined;
  const folderId = item ? itemFolderByItemId.get(item.itemId) ?? NO_FOLDER_VALUE : NO_FOLDER_VALUE;

  const initialValues = useMemo((): NewItemFormInitialValues | undefined => {
    if (!item || !isItemCategoryId(item.categoryId)) {
      return undefined;
    }
    return {
      itemId: item.itemId,
      recordName: item.title,
      categoryId: item.categoryId,
      vaultId: item.vaultId,
      folderId,
      sections: itemPlaintextToKeyFormSections(item),
      tags: item.tags ?? [],
      createdAtMs: item.createdAtMs,
    };
  }, [item, folderId]);

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

  async function handleSave() {
    const validation = formRef.current?.validate();
    if (!validation?.ok) {
      setShowValidation(true);
      return;
    }
    const payload = formRef.current?.getSavePayload();
    if (!payload || !item || payload.createdAtMs === undefined) {
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
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.editItemPopup.saveErrorGeneric"),
        },
        async () => {
          const updatedItem = buildItemFromEditSavePayload(payload, payload.createdAtMs);
          await updateItem(updatedItem);
          await deleteRemovedKeyFieldFiles(
            formRef.current?.getFileBaselineSections() ?? initialValues.sections,
            formRef.current?.getCurrentSections() ?? payload.sections,
            deleteDevKeyFieldFile,
          );
          if (payload.folderId !== folderId && payload.folderId !== NO_FOLDER_VALUE) {
            await assignItemToFolder(payload.itemId, payload.folderId);
          }
        },
      );
      closePopup();
      setShowValidation(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("web.editItemPopup.saveErrorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!open || !item || !initialValues) {
    return null;
  }

  return (
    <Popup
      id={EDIT_ITEM_POPUP_ID}
      header={t("web.editItemPopup.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      closeDisabled={saving}
      panelClassName="min-h-[720px]"
      footer={
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
      }
    >
      {saveError ? <p className="mb-4 text-sm text-destructive">{saveError}</p> : null}
      <NewItemForm
        ref={formRef}
        t={t}
        categoryId={initialValues.categoryId}
        workspaceName={workspaceName}
        vaults={vaults}
        vaultsListReady={vaultsListReady}
        showValidation={showValidation}
        initialValues={initialValues}
      />
    </Popup>
  );
}
