import type { WebMessageValues } from "@okkey/i18n";
import type { Vault, WorkspaceItemTemplateDto } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Button, Popup, type KeyFieldFileValue } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { deleteKeyFieldFileAttachment } from "../../api/key-field-files";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { usePopupZoneGate } from "../../auth/usePopupZoneGate";
import { deleteRemovedKeyFieldFiles } from "../../items/keyFieldFileAttachments";
import { keyFieldFileValueFromFaviconId, syncItemFaviconForPlaintext } from "../../items/syncItemFavicon";
import {
  buildTemplateCreatePayload,
  buildTemplatePrefillValues,
  buildTemplateUpdatePayload,
  syncTemplateFaviconForSnapshot,
} from "../../items/itemTemplateHelpers";
import { useWorkspaceItemTemplates } from "../../items/useWorkspaceItemTemplates";
import { useWorkspaceFolders } from "../../folders/WorkspaceFoldersContext";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { buildItemCopyPrefillValues } from "../../items/buildItemCopyPrefill";
import { runSaveWithToast } from "../../lib/saveWithToast";
import PopupSaveButton from "../ui/PopupSaveButton";
import { buildItemFromNewItemSavePayload } from "./NewItemForm";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useLocale } from "../../locale/LocaleContext";
import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";
import {
  COPY_ITEM_QUERY_PARAM,
  ITEM_TEMPLATE_QUERY_PARAM,
  NEW_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { ITEM_QUERY_PARAM } from "../../routes/paths";
import { getItemCategoryDefinition, isItemCategoryId, itemCategoryIdToPopupSlug, popupSlugToItemCategoryId } from "./itemCategoryCatalog";
import { getCategoryLabel } from "./NewItemCategoryCard";
import NewItemCategoryPicker from "./NewItemCategoryPicker";
import NewItemForm, { type NewItemFormHandle, type NewItemFormPrefillValues } from "./NewItemForm";
import NewItemFormActionsMenu from "./NewItemFormActionsMenu";
import SaveItemTemplatePopup from "./SaveItemTemplatePopup";
import ExitNewItemFormConfirmPopup from "./ExitNewItemFormConfirmPopup";
import { BackChevronIcon } from "./itemCategoryIcons";
import { useItemCategoryPreferences } from "./useItemCategoryPreferences";

type NewItemPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

type PendingNewItemExitAction = "close" | "backToCategories";

export default function NewItemPopup({ t, workspaceId, workspaceName, vaults, vaultsListReady }: NewItemPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const urlOpen = activePopup?.popupId === NEW_ITEM_POPUP_ID;
  const selectedCategoryId =
    urlOpen && activePopup.menuItemId ? popupSlugToItemCategoryId(activePopup.menuItemId) : null;
  const copyFromItemId = urlOpen ? searchParams.get(COPY_ITEM_QUERY_PARAM)?.trim() ?? "" : "";
  const templateId = urlOpen ? searchParams.get(ITEM_TEMPLATE_QUERY_PARAM)?.trim() ?? "" : "";

  const formRef = useRef<NewItemFormHandle>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templatePopupMode, setTemplatePopupMode] = useState<"create" | "update">("create");
  const [categoryPickerShowAllExpanded, setCategoryPickerShowAllExpanded] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [pendingExitAction, setPendingExitAction] = useState<PendingNewItemExitAction | null>(null);
  const { createItem, getItemById, filesInItemsEnabled, resolveVaultEncryptionKey } = useWorkspaceItems();
  const { canPostToVault } = useWorkspaceVaultProfiles();
  const { assignItemToFolder, itemFolderByItemId } = useWorkspaceFolders();
  const { accessToken, vaultKey } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const { favoriteOrder, favoriteIdSet, favoriteTemplateIdSet, ready, toggleFavorite, toggleTemplateFavorite, reorderFavorites } =
    useItemCategoryPreferences();
  const { templates, ready: templatesReady, refresh: refreshTemplates } = useWorkspaceItemTemplates();
  const { locale } = useLocale();
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);

  const copySourceItem = copyFromItemId ? getItemById(copyFromItemId) : undefined;
  const copyPrefillValues = useMemo((): NewItemFormPrefillValues | undefined => {
    if (!copySourceItem || !selectedCategoryId || copySourceItem.categoryId !== selectedCategoryId) {
      return undefined;
    }
    const folderId = itemFolderByItemId.get(copySourceItem.itemId) ?? NO_FOLDER_VALUE;
    const personalVaultId = vaults.find((vault) => vault.isPersonal)?.id;
    return buildItemCopyPrefillValues(copySourceItem, folderId, keyFormMessages, {
      vaultId: personalVaultId,
    });
  }, [copySourceItem, selectedCategoryId, itemFolderByItemId, keyFormMessages, vaults]);

  const templatePrefillValues = useMemo((): NewItemFormPrefillValues | undefined => {
    if (!templateId || !selectedCategoryId) {
      return undefined;
    }
    const template = templates.find((entry) => entry.id === templateId);
    if (!template || template.category_id !== selectedCategoryId) {
      return undefined;
    }
    return buildTemplatePrefillValues(template);
  }, [templateId, selectedCategoryId, templates]);

  const formPrefillValues = copyPrefillValues ?? templatePrefillValues;

  const activeTemplate = useMemo(() => {
    if (!templateId) {
      return undefined;
    }
    return templates.find((entry) => entry.id === templateId);
  }, [templateId, templates]);

  function closePopup() {
    setShowValidation(false);
    setSaveError(null);
    setPendingExitAction(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  const open = usePopupZoneGate("itemPopups", urlOpen, closePopup);

  useEffect(() => {
    if (!open) {
      setCategoryPickerShowAllExpanded(false);
      setPendingExitAction(null);
    }
  }, [open]);

  function backToCategories() {
    setShowValidation(false);
    setSaveError(null);
    setPendingExitAction(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function shouldConfirmExitFromForm(): boolean {
    const formVisible = Boolean(
      selectedCategoryId && (!copyFromItemId || copyPrefillValues) && (!templateId || templatePrefillValues),
    );
    return formVisible && Boolean(formRef.current?.hasUnsavedChanges());
  }

  function handleCloseRequest(): boolean {
    if (shouldConfirmExitFromForm()) {
      setPendingExitAction("close");
      return false;
    }
    return true;
  }

  function requestClosePopup() {
    if (handleCloseRequest()) {
      closePopup();
    }
  }

  function requestBackToCategories() {
    if (shouldConfirmExitFromForm()) {
      setPendingExitAction("backToCategories");
      return;
    }
    backToCategories();
  }

  function confirmPendingExit() {
    const action = pendingExitAction;
    setPendingExitAction(null);
    if (action === "backToCategories") {
      backToCategories();
      return;
    }
    if (action === "close") {
      closePopup();
    }
  }

  function selectCategory(categoryId: string) {
    if (!isItemCategoryId(categoryId)) {
      return;
    }
    setShowValidation(false);
    setSaveError(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(
          location.search,
          buildPopupQueryValue(NEW_ITEM_POPUP_ID, itemCategoryIdToPopupSlug(categoryId)),
        ),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function selectTemplate(template: WorkspaceItemTemplateDto) {
    if (!isItemCategoryId(template.category_id)) {
      return;
    }
    setShowValidation(false);
    setSaveError(null);
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(
          location.search,
          buildPopupQueryValue(NEW_ITEM_POPUP_ID, itemCategoryIdToPopupSlug(template.category_id)),
          { templateId: template.id },
        ),
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
      setShowValidation(false);
      setSaveError(null);
      if (!isItemCategoryId(createdTemplate.category_id)) {
        throw new Error("INVALID_ITEM_CATEGORY");
      }
      navigate(
        {
          pathname: location.pathname,
          search: popupQuerySearch(
            location.search,
            buildPopupQueryValue(NEW_ITEM_POPUP_ID, itemCategoryIdToPopupSlug(createdTemplate.category_id)),
            { templateId: createdTemplate.id },
          ),
          hash: location.hash,
        },
        { replace: true },
      );
    } catch (error) {
      setSaveTemplateError(error instanceof Error ? error.message : t("web.saveItemTemplatePopup.saveErrorGeneric"));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleUpdateTemplate({ templateName, addToFavorite }: { templateName: string; addToFavorite: boolean }) {
    const snapshot = formRef.current?.getTemplateSnapshot();
    const faviconSyncInput = formRef.current?.getFaviconSyncInput();
    if (!snapshot || !core || !accessToken || !vaultKey || !templateId || !activeTemplate || !isItemCategoryId(snapshot.categoryId)) {
      setSaveTemplateError(t("web.updateItemTemplatePopup.saveErrorGeneric"));
      return;
    }

    setSavingTemplate(true);
    setSaveTemplateError(null);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.updateItemTemplatePopup.saveSuccess"),
          error: t("web.updateItemTemplatePopup.saveErrorGeneric"),
        },
        async () => {
          const templateFiles = await formRef.current!.uploadPendingFiles(
            {
              itemId: templateId,
              vaultId: snapshot.vaultId,
              folderId: snapshot.folderId,
              recordName: snapshot.recordName,
              categoryId: snapshot.categoryId,
              sections: snapshot.sections,
              tags: snapshot.tags,
            },
            { targetItemId: templateId, sourceItemId: snapshot.attachmentItemId ?? templateId },
          );
          const uploadedSnapshot = { ...snapshot, sections: templateFiles.payload.sections, attachmentItemId: templateId };
          const favicon = await syncTemplateFaviconForSnapshot(
            accessToken,
            vaultKey,
            templateId,
            uploadedSnapshot,
            faviconSyncInput,
          );
          const body = buildTemplateUpdatePayload(
            uploadedSnapshot,
            templateName,
            favicon.faviconId ?? null,
            favicon.faviconSource,
          );
          try {
            await core.updateWorkspaceItemTemplate(workspaceId, templateId, body);
          } catch (error) {
            const filesToDelete = favicon.uploadedFavicon
              ? [...templateFiles.uploadedFiles, favicon.uploadedFavicon]
              : templateFiles.uploadedFiles;
            await Promise.allSettled(
              filesToDelete.map((file) =>
                deleteKeyFieldFileAttachment({
                  accessToken,
                  vaultId: uploadedSnapshot.vaultId,
                  itemId: templateId,
                  file,
                }),
              ),
            );
            throw error;
          }
          await deleteRemovedKeyFieldFiles(
            formRef.current?.getFileBaselineSections() ?? [],
            uploadedSnapshot.sections,
            (file) =>
              deleteKeyFieldFileAttachment({
                accessToken,
                vaultId: uploadedSnapshot.vaultId,
                itemId: templateId,
                file,
              }),
          );
          if (activeTemplate.favicon_id && activeTemplate.favicon_id !== (favicon.faviconId ?? null)) {
            await deleteKeyFieldFileAttachment({
              accessToken,
              vaultId: uploadedSnapshot.vaultId,
              itemId: templateId,
              file: keyFieldFileValueFromFaviconId(activeTemplate.favicon_id),
            });
          }
          await refreshTemplates();
        },
      );
      const isFavorite = favoriteTemplateIdSet.has(templateId);
      if (addToFavorite !== isFavorite) {
        toggleTemplateFavorite(templateId);
      }
      setSaveTemplateOpen(false);
      setShowValidation(false);
      setSaveError(null);
    } catch (error) {
      setSaveTemplateError(error instanceof Error ? error.message : t("web.updateItemTemplatePopup.saveErrorGeneric"));
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!templateId || !core) {
      return;
    }

    setDeletingTemplate(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.newItemPopup.deleteTemplateSuccess"),
          error: t("web.newItemPopup.deleteTemplateErrorGeneric"),
        },
        async () => {
          await core.deleteWorkspaceItemTemplate(workspaceId, templateId);
          if (favoriteTemplateIdSet.has(templateId)) {
            toggleTemplateFavorite(templateId);
          }
          await refreshTemplates();
        },
      );
      backToCategories();
    } catch {
      /* toast handles error */
    } finally {
      setDeletingTemplate(false);
    }
  }

  async function handleSave() {
    const form = formRef.current;
    const validation = form?.validate();
    if (!validation?.ok) {
      setShowValidation(true);
      return;
    }
    const payload = form?.getSavePayload();
    if (!form || !payload) {
      setShowValidation(true);
      return;
    }
    const faviconSyncInput = form.getFaviconSyncInput();

    if (!canPostToVault(payload.vaultId)) {
      setSaveError(t("web.newItemPopup.saveErrorGeneric"));
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
          if (!accessToken || !vaultKey) {
            throw new Error("AUTH_REQUIRED");
          }
          const itemVaultKey = await resolveVaultEncryptionKey(payload.vaultId);
          const { payload: uploadedPayload, uploadedFiles } = await formRef.current!.uploadPendingFiles(payload);
          let item = buildItemFromNewItemSavePayload(uploadedPayload);
          let createdItemId: string;
          let uploadedFavicon: KeyFieldFileValue | undefined;
          try {
            const faviconSync = await syncItemFaviconForPlaintext(
              accessToken,
              itemVaultKey,
              item,
              undefined,
              faviconSyncInput,
            );
            item = faviconSync.item;
            uploadedFavicon = faviconSync.uploadedFavicon;
            createdItemId = await createItem(item);
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
            formRef.current?.getFileBaselineSections() ?? [],
            uploadedPayload.sections,
            (file) => deleteKeyFieldFileAttachment({ accessToken, vaultId: uploadedPayload.vaultId, itemId: uploadedPayload.itemId, file }),
          );
          if (uploadedPayload.folderId !== NO_FOLDER_VALUE) {
            await assignItemToFolder(createdItemId, uploadedPayload.folderId);
          }
          return createdItemId;
        },
      );
      const params = new URLSearchParams(location.search);
      params.delete(POPUP_QUERY_PARAM);
      params.delete(COPY_ITEM_QUERY_PARAM);
      params.delete(ITEM_TEMPLATE_QUERY_PARAM);
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
        onClick={requestBackToCategories}
      >
        <BackChevronIcon />
      </Button>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-7 text-foreground">
        {activeTemplate
          ? t("web.newItemPopup.newRecordFromTemplateTitle", { template: activeTemplate.name })
          : t("web.newItemPopup.newRecordTitle", { category: selectedCategoryLabel ?? selectedCategoryId })}
      </h2>
    </div>
  ) : (
    t("web.items.createRecord")
  );

  const showItemForm = Boolean(selectedCategoryId && (!copyFromItemId || copyPrefillValues) && (!templateId || templatePrefillValues));

  return (
    <>
    <Popup
      id={NEW_ITEM_POPUP_ID}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      onCloseRequest={showItemForm ? handleCloseRequest : undefined}
      closeDisabled={saving || savingTemplate || deletingTemplate}
      panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
      footer={
        showItemForm ? (
          <div className="flex w-full items-center justify-between gap-2">
            <NewItemFormActionsMenu
              t={t}
              disabled={saving || savingTemplate || deletingTemplate}
              isEditingTemplate={Boolean(templateId && activeTemplate)}
              showDeleteTemplate={Boolean(templateId && activeTemplate)}
              onUpdateTemplate={() => {
                setSaveTemplateError(null);
                setTemplatePopupMode("update");
                setSaveTemplateOpen(true);
              }}
              onSaveTemplate={() => {
                setSaveTemplateError(null);
                setTemplatePopupMode("create");
                setSaveTemplateOpen(true);
              }}
              onDeleteTemplate={() => void handleDeleteTemplate()}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={requestClosePopup} disabled={saving || savingTemplate || deletingTemplate}>
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
        ) : (
          <Button type="button" variant="outline" onClick={closePopup}>
            {t("web.newItemPopup.cancel")}
          </Button>
        )
      }
    >
      {saveError ? <p className="mb-4 text-sm text-destructive">{saveError}</p> : null}
      {selectedCategoryId && copyFromItemId && !copyPrefillValues ? (
        <p className="text-sm text-muted-foreground">{t("web.newItemPopup.copySourceUnavailable")}</p>
      ) : null}
      {selectedCategoryId && templateId && !templatePrefillValues ? (
        <p className="text-sm text-muted-foreground">{t("web.newItemPopup.templateSourceUnavailable")}</p>
      ) : null}
      {showItemForm ? (
        <NewItemForm
          key={templateId ? `template-${templateId}` : copyFromItemId ? `copy-${copyFromItemId}` : `category-${selectedCategoryId}`}
          ref={formRef}
          t={t}
          categoryId={selectedCategoryId!}
          workspaceName={workspaceName}
          vaults={vaults}
          vaultsListReady={vaultsListReady}
          showValidation={showValidation}
          prefillValues={formPrefillValues}
          templateName={activeTemplate?.name}
          onCanSaveChange={setCanSave}
        />
      ) : !selectedCategoryId ? (
        <NewItemCategoryPicker
          t={t}
          favoriteOrder={favoriteOrder}
          favoriteIdSet={favoriteIdSet}
          favoriteTemplateIdSet={favoriteTemplateIdSet}
          templates={templates}
          templatesReady={templatesReady}
          ready={ready}
          onToggleFavorite={toggleFavorite}
          onToggleTemplateFavorite={toggleTemplateFavorite}
          onReorderFavorites={reorderFavorites}
          onSelectCategory={selectCategory}
          onSelectTemplate={selectTemplate}
          showAllCategoriesExpanded={categoryPickerShowAllExpanded}
          onShowAllCategoriesExpandedChange={setCategoryPickerShowAllExpanded}
          filesInItemsEnabled={filesInItemsEnabled}
        />
      ) : null}
    </Popup>
    <ExitNewItemFormConfirmPopup
      open={pendingExitAction !== null}
      t={t}
      onClose={() => setPendingExitAction(null)}
      onConfirm={confirmPendingExit}
    />
    <SaveItemTemplatePopup
      open={saveTemplateOpen}
      mode={templatePopupMode}
      t={t}
      saving={savingTemplate}
      error={saveTemplateError}
      initialTemplateName={
        templatePopupMode === "update"
          ? activeTemplate?.name ?? ""
          : formRef.current?.getTemplateSnapshot()?.recordName ?? ""
      }
      templateReferenceName={activeTemplate?.name}
      initialAddToFavorite={
        templatePopupMode === "update" && templateId ? favoriteTemplateIdSet.has(templateId) : false
      }
      onClose={() => setSaveTemplateOpen(false)}
      onSave={(input) =>
        void (templatePopupMode === "update" ? handleUpdateTemplate(input) : handleSaveTemplate(input))
      }
    />
    </>
  );
}
