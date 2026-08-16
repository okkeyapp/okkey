import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Button, Popup, type KeyFieldFileValue } from "@okkey/ui";
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
import { keyFieldFileValueFromFaviconId, syncItemFaviconForPlaintext } from "../../items/syncItemFavicon";
import { useWorkspaceItemTemplates } from "../../items/useWorkspaceItemTemplates";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
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
  const { getItemById, updateItem, resolveVaultEncryptionKey, getItemCreatedByUserId } = useWorkspaceItems();
  const { canPutItem } = useWorkspaceVaultProfiles();
  const { assignItemToFolder, itemFolderByItemId } = useWorkspaceFolders();
  const { accessToken, vaultKey } = useAuthVault();
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
      attachmentItemId: item.itemId,
      ...(item.faviconId ? { faviconId: item.faviconId } : {}),
      ...(item.faviconId ? { faviconItemId: item.itemId } : {}),
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
    if (!snapshot || !core || !accessToken || !vaultKey || !isItemCategoryId(snapshot.categoryId)) {
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
          const templateFiles = await formRef.current!.uploadPendingFiles(
            {
              itemId: draftTemplateId,
              vaultId: snapshot.vaultId,
              folderId: snapshot.folderId,
              recordName: snapshot.recordName,
              categoryId: snapshot.categoryId,
              sections: snapshot.sections,
              tags: snapshot.tags,
            },
            { targetItemId: draftTemplateId, sourceItemId: snapshot.attachmentItemId },
          );
          const uploadedSnapshot = { ...snapshot, sections: templateFiles.payload.sections };
          const favicon = await syncTemplateFaviconForSnapshot(
            accessToken,
            vaultKey,
            draftTemplateId,
            uploadedSnapshot,
            faviconSyncInput,
          );
          const body = buildTemplateCreatePayload(
            draftTemplateId,
            uploadedSnapshot,
            templateName,
            favicon.faviconId,
            favicon.faviconSource,
          );
          let response;
          try {
            response = await core.createWorkspaceItemTemplate(workspaceId, body);
          } catch (error) {
            const filesToDelete = favicon.uploadedFavicon
              ? [...templateFiles.uploadedFiles, favicon.uploadedFavicon]
              : templateFiles.uploadedFiles;
            await Promise.allSettled(
              filesToDelete.map((file) =>
                deleteKeyFieldFileAttachment({
                  accessToken,
                  vaultId: uploadedSnapshot.vaultId,
                  itemId: draftTemplateId,
                  file,
                }),
              ),
            );
            throw error;
          }
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

    if (!canPutItem(payload.vaultId, getItemCreatedByUserId(item.itemId))) {
      setSaveError(t("web.editItemPopup.saveErrorGeneric"));
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
          if (!accessToken || !vaultKey) {
            throw new Error("AUTH_REQUIRED");
          }
          const itemVaultKey = await resolveVaultEncryptionKey(payload.vaultId);
          const { payload: uploadedPayload, uploadedFiles } = await formRef.current!.uploadPendingFiles(payload);
          let updatedItem = buildItemFromEditSavePayload(uploadedPayload, uploadedPayload.createdAtMs!, item);
          let uploadedFavicon: KeyFieldFileValue | undefined;
          try {
            const faviconSync = await syncItemFaviconForPlaintext(
              accessToken,
              itemVaultKey,
              updatedItem,
              item,
              faviconSyncInput,
            );
            updatedItem = faviconSync.item;
            uploadedFavicon = faviconSync.uploadedFavicon;
            await updateItem(updatedItem);
          } catch (error) {
            const filesToDelete = uploadedFavicon ? [...uploadedFiles, uploadedFavicon] : uploadedFiles;
            await Promise.allSettled(
              filesToDelete.map((file) =>
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
          if (item.faviconId && item.faviconId !== updatedItem.faviconId) {
            await deleteKeyFieldFileAttachment({
              accessToken,
              vaultId: item.vaultId,
              itemId: item.itemId,
              file: keyFieldFileValueFromFaviconId(item.faviconId),
            });
          }
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
        initialTemplateName={formRef.current?.getTemplateSnapshot()?.recordName ?? ""}
        onClose={() => setSaveTemplateOpen(false)}
        onSave={(input) => void handleSaveTemplate(input)}
      />
    </>
  );
}
