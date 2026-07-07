import type { WebMessageValues } from "@okkey/i18n";
import type { Vault, WorkspaceItemTemplateDto } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { deleteDevKeyFieldFile } from "../../api/key-field-files";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { deleteRemovedKeyFieldFiles } from "../../items/keyFieldFileAttachments";
import { syncItemFaviconForPlaintext } from "../../items/syncItemFavicon";
import {
  buildTemplateCreatePayload,
  buildTemplatePrefillValues,
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
    open && activePopup.menuItemId ? popupSlugToItemCategoryId(activePopup.menuItemId) : null;
  const copyFromItemId = open ? searchParams.get(COPY_ITEM_QUERY_PARAM)?.trim() ?? "" : "";
  const templateId = open ? searchParams.get(ITEM_TEMPLATE_QUERY_PARAM)?.trim() ?? "" : "";

  const formRef = useRef<NewItemFormHandle>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const { createItem, getItemById } = useWorkspaceItems();
  const { assignItemToFolder, itemFolderByItemId } = useWorkspaceFolders();
  const { accessToken } = useAuthVault();
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
    return buildItemCopyPrefillValues(copySourceItem, folderId, keyFormMessages);
  }, [copySourceItem, selectedCategoryId, itemFolderByItemId, keyFormMessages]);

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
      setShowValidation(false);
      setSaveError(null);
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
    const faviconSyncInput = formRef.current.getFaviconSyncInput();

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
          item = await syncItemFaviconForPlaintext(accessToken, item, undefined, faviconSyncInput);
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
        onClick={backToCategories}
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
      closeDisabled={saving || savingTemplate || deletingTemplate}
      panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
      footer={
        showItemForm ? (
          <div className="flex w-full items-center justify-between gap-2">
            <NewItemFormActionsMenu
              t={t}
              disabled={saving || savingTemplate || deletingTemplate}
              showDeleteTemplate={Boolean(templateId && activeTemplate)}
              onSaveTemplate={() => {
                setSaveTemplateError(null);
                setSaveTemplateOpen(true);
              }}
              onDeleteTemplate={() => void handleDeleteTemplate()}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={closePopup} disabled={saving || savingTemplate || deletingTemplate}>
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
        />
      ) : null}
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
