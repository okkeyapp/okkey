import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { deleteKeyFieldFileAttachment } from "../../api/key-field-files";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { deleteRemovedKeyFieldFiles } from "../../items/keyFieldFileAttachments";
import { itemPlaintextToKeyFormSections } from "../../items/itemPlaintextToKeyFormSections";
import {
  buildTemplateCreatePayload,
  syncTemplateFaviconForSnapshot,
} from "../../items/itemTemplateHelpers";
import { syncItemFaviconForPlaintext } from "../../items/syncItemFavicon";
import { useWorkspaceItemTemplates } from "../../items/useWorkspaceItemTemplates";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useLocale } from "../../locale/LocaleContext";
import { runSaveWithToast } from "../../lib/saveWithToast";
import PopupSaveButton from "../ui/PopupSaveButton";
import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";
import {
  EDIT_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { isItemCategoryId } from "./itemCategoryCatalog";
import NewItemForm, {
  buildItemFromEditSavePayload,
  type NewItemFormHandle,
  type NewItemFormInitialValues,
} from "./NewItemForm";
import NewItemFormActionsMenu from "./NewItemFormActionsMenu";
import SaveItemTemplatePopup from "./SaveItemTemplatePopup";
import { useItemCategoryPreferences } from "./useItemCategoryPreferences";

type EditItemPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function EditItemPopup({
  t,
  workspaceId,
  workspaceName,
  vaults,
  vaultsListReady,
}: EditItemPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === EDIT_ITEM_POPUP_ID;
  const itemId = open ? activePopup.menuItemId?.trim() ?? "" : "";

  const formRef = useRef<NewItemFormHandle>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const { getItemById, updateItem } = useWorkspaceItems();
  const { assignItemToFolder, itemFolderByItemId } = useWorkspaceFolders();
  const { accessToken } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const { favoriteTemplateIdSet, toggleTemplateFavorite } = useItemCategoryPreferences();
  const { refresh: refreshTemplates } = useWorkspaceItemTemplates();
  const { locale } = useLocale();
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);

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
      sections: itemPlaintextToKeyFormSections(item, keyFormMessages, { includeEmptyFields: true }),
      tags: item.tags ?? [],
      createdAtMs: item.createdAtMs,
      ...(item.faviconId ? { faviconId: item.faviconId } : {}),
      ...(item.faviconSource ? { faviconSource: item.faviconSource } : {}),
    };
  }, [item, folderId, keyFormMessages]);

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

  async function handleSaveTemplate({ templateName, addToFavorite }: { templateName: string; addToFavorite: boolean }) {
    const snapshot = formRef.current?.getTemplateSnapshot();
    const faviconSyncInput = formRef.current?.getFaviconSyncInput();
    if (!snapshot || !core || !accessToken || !isItemCategoryId(snapshot.categoryId)) {
      setSaveTemplateError(t("web.saveItemTemplatePopup.saveErrorGeneric"));
      return;
    }

    setSavingTemplate(true);
    setSaveTemplateError(null);
    try {
      const createdTemplate = await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.saveItemTemplatePopup.saveSuccess"),
          error: t("web.saveItemTemplatePopup.saveErrorGeneric"),
        },
        async () => {
          const draftTemplateId = generateEntityId();
          const favicon = await syncTemplateFaviconForSnapshot(
            accessToken,
            draftTemplateId,
            snapshot,
            faviconSyncInput,
          );
          const body = buildTemplateCreatePayload(
            snapshot,
            templateName,
            favicon.faviconId,
            favicon.faviconSource,
          );
          const response = await core.createWorkspaceItemTemplate(workspaceId, body);
          await refreshTemplates();
          return response.template;
        },
      );
      if (addToFavorite && !favoriteTemplateIdSet.has(createdTemplate.id)) {
        toggleTemplateFavorite(createdTemplate.id);
      }
      setSaveTemplateOpen(false);
    } catch (error) {
      setSaveTemplateError(error instanceof Error ? error.message : t("web.saveItemTemplatePopup.saveErrorGeneric"));
    } finally {
      setSavingTemplate(false);
    }
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
    const faviconSyncInput = formRef.current.getFaviconSyncInput();

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
          if (!accessToken) {
            throw new Error("AUTH_REQUIRED");
          }
          const { payload: uploadedPayload, uploadedFiles } = await formRef.current!.uploadPendingFiles(payload);
          let updatedItem = buildItemFromEditSavePayload(uploadedPayload, uploadedPayload.createdAtMs!, item);
          try {
            updatedItem = await syncItemFaviconForPlaintext(
              accessToken,
              updatedItem,
              item,
              faviconSyncInput,
            );
            await updateItem(updatedItem);
          } catch (error) {
            await Promise.allSettled(
              uploadedFiles.map((file) =>
                deleteKeyFieldFileAttachment({ accessToken, vaultId: uploadedPayload.vaultId, itemId: uploadedPayload.itemId, file }),
              ),
            );
            throw error;
          }
          await deleteRemovedKeyFieldFiles(
            formRef.current?.getFileBaselineSections() ?? initialValues.sections,
            uploadedPayload.sections,
            (file) => deleteKeyFieldFileAttachment({ accessToken, vaultId: uploadedPayload.vaultId, itemId: uploadedPayload.itemId, file }),
          );
          if (uploadedPayload.folderId !== folderId && uploadedPayload.folderId !== NO_FOLDER_VALUE) {
            await assignItemToFolder(uploadedPayload.itemId, uploadedPayload.folderId);
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
    <>
      <Popup
        id={EDIT_ITEM_POPUP_ID}
        header={t("web.editItemPopup.title")}
        closeLabel={t("web.settingsPopup.close")}
        onClose={closePopup}
        closeDisabled={saving || savingTemplate}
        panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <NewItemFormActionsMenu
              t={t}
              disabled={saving || savingTemplate}
              onSaveTemplate={() => {
                setSaveTemplateError(null);
                setSaveTemplateOpen(true);
              }}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={closePopup} disabled={saving || savingTemplate}>
                {t("web.newItemPopup.cancel")}
              </Button>
              <PopupSaveButton
                saving={saving}
                disabled={!canSave}
                saveLabel={t("web.newItemPopup.save")}
                savingLabel={t("web.newItemPopup.saving")}
                onClick={() => void handleSave()}
              />
            </div>
          </div>
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
          onCanSaveChange={setCanSave}
        />
      </Popup>
      <SaveItemTemplatePopup
        open={saveTemplateOpen}
        t={t}
        saving={savingTemplate}
        error={saveTemplateError}
        onClose={() => setSaveTemplateOpen(false)}
        onSave={(input) => void handleSaveTemplate(input)}
      />
    </>
  );
}
