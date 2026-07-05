import type { ItemFaviconSource } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import type { ItemPlaintextV2, Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Input, cn } from "@okkey/ui";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { collectWebsiteUrlsFromSections, suggestedRecordTitleFromWebsiteUrls } from "../../lib/domainRecordTitle";
import { keyFormSectionsToItemPlaintext } from "../../items/keyFormToItemPlaintext";
import { useItemFormFavicon, type ItemFormFaviconSyncInput } from "../../items/useItemFormFavicon";
import type { ItemTemplateFormSnapshot } from "../../items/itemTemplateHelpers";
import {
  validateNewItemForm,
  type NewItemFormValidationIssue,
  type NewItemFormValidationResult,
} from "../../items/validateNewItemForm";
import { useLocale } from "../../locale/LocaleContext";
import { KeyFormEditor, type KeyFormEditorSection } from "../key-form/KeyFormEditor";
import { createKeyFormEditorMessages, createLocalizedKeyFieldTypes } from "../key-form/keyFormI18n";
import { getCategoryLabel } from "./NewItemCategoryCard";
import { getItemCategoryDefinition } from "./itemCategoryCatalog";
import { getDefaultSectionsForCategory } from "./itemCategoryDefaultSections";
import ItemRecordFavicon from "./ItemRecordFavicon";
import { ItemRecordFaviconField } from "./ItemRecordFaviconField";
import NewItemSaveLocationSection, { useSyncedNewItemVaultId } from "./NewItemSaveLocationSection";
import NewItemTagsSection from "./NewItemTagsSection";
import { useAuthVault } from "../../auth/AuthVaultContext";

export type NewItemSavePayload = {
  itemId: string;
  vaultId: string;
  folderId: string;
  recordName: string;
  categoryId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  createdAtMs?: number;
};

export type NewItemFormPrefillValues = {
  recordName: string;
  vaultId: string;
  folderId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  faviconId?: string;
  faviconSource?: ItemFaviconSource;
};

export type NewItemFormInitialValues = {
  itemId: string;
  recordName: string;
  categoryId: string;
  vaultId: string;
  folderId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  createdAtMs: number;
  faviconId?: string;
  faviconSource?: ItemFaviconSource;
};

export type NewItemFormHandle = {
  validate: () => NewItemFormValidationResult;
  getSavePayload: () => NewItemSavePayload | null;
  getFileBaselineSections: () => KeyFormEditorSection[];
  getCurrentSections: () => KeyFormEditorSection[];
  getFaviconSyncInput: () => ItemFormFaviconSyncInput;
  getTemplateSnapshot: () => ItemTemplateFormSnapshot | null;
};

type NewItemFormProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  categoryId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
  showValidation?: boolean;
  initialValues?: NewItemFormInitialValues;
  prefillValues?: NewItemFormPrefillValues;
  /** When creating from a workspace template — enables auto-title from template name. */
  templateName?: string;
};

const NewItemForm = forwardRef<NewItemFormHandle, NewItemFormProps>(function NewItemForm(
  { t, categoryId, workspaceName, vaults, vaultsListReady, showValidation = false, initialValues, prefillValues, templateName },
  ref,
) {
  const isEditMode = Boolean(initialValues);
  const isTemplateMode = Boolean(templateName);
  const isCopyMode = Boolean(prefillValues) && !isTemplateMode;
  const { accessToken } = useAuthVault();
  const itemIdRef = useRef(initialValues?.itemId ?? generateEntityId());
  const formInstanceKeyRef = useRef(
    initialValues?.itemId ?? (isCopyMode || isTemplateMode ? generateEntityId() : categoryId),
  );
  const { locale } = useLocale();
  const category = getItemCategoryDefinition(categoryId);
  const categoryLabel = category ? getCategoryLabel(t, category) : categoryId;
  const [recordName, setRecordName] = useState(
    initialValues?.recordName ?? (isCopyMode ? (prefillValues?.recordName ?? "") : ""),
  );
  const recordNameEditedRef = useRef(Boolean(initialValues ?? (isCopyMode && prefillValues)));
  const recordNameInputRef = useRef<HTMLInputElement>(null);
  const [formSections, setFormSections] = useState<KeyFormEditorSection[] | null>(
    initialValues?.sections ?? prefillValues?.sections ?? null,
  );
  const [tags, setTags] = useState<string[]>(initialValues?.tags ?? prefillValues?.tags ?? []);
  const [vaultId, setVaultId] = useState(initialValues?.vaultId ?? prefillValues?.vaultId ?? "");
  const [folderId, setFolderId] = useState(initialValues?.folderId ?? prefillValues?.folderId ?? NO_FOLDER_VALUE);
  const [syncedVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  useEffect(() => {
    if (!isEditMode && !isCopyMode && !isTemplateMode && syncedVaultId && !vaultId) {
      setVaultId(syncedVaultId);
    }
  }, [isEditMode, isCopyMode, isTemplateMode, syncedVaultId, vaultId]);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const keyFormFieldTypes = useMemo(() => createLocalizedKeyFieldTypes(locale), [locale]);
  const initialSections = useMemo(
    () =>
      initialValues?.sections ??
      prefillValues?.sections ??
      (category ? getDefaultSectionsForCategory(category.id, keyFormMessages) : []),
    [initialValues?.sections, prefillValues?.sections, category, keyFormMessages],
  );
  const [committedWebsiteUrls, setCommittedWebsiteUrls] = useState<string[]>(() =>
    prefillValues?.sections ? collectWebsiteUrlsFromSections(prefillValues.sections) : [],
  );
  const suggestedRecordName = useMemo(() => {
    if (category?.id === "login") {
      return suggestedRecordTitleFromWebsiteUrls(committedWebsiteUrls);
    }
    if (isTemplateMode && templateName) {
      return templateName;
    }
    if (category) {
      return categoryLabel;
    }
    return "";
  }, [category, categoryLabel, committedWebsiteUrls, isTemplateMode, templateName]);
  const trimmedRecordName = recordName.trim();
  const recordNameInvalid = showValidation && trimmedRecordName.length === 0;
  const faviconState = useItemFormFavicon({
    accessToken,
    categoryId,
    urls: committedWebsiteUrls,
    initialFaviconId: initialValues?.faviconId ?? prefillValues?.faviconId,
    initialFaviconSource: initialValues?.faviconSource ?? prefillValues?.faviconSource,
  });
  const {
    previewImageSrc,
    previewLoading,
    uploadError,
    uploadIconFile,
    getSyncInput,
  } = faviconState;

  const handleWebsiteUrlsBlur = useCallback((sections: KeyFormEditorSection[]) => {
    setCommittedWebsiteUrls(collectWebsiteUrlsFromSections(sections));
  }, []);

  useEffect(() => {
    if (isEditMode || isCopyMode || isTemplateMode) {
      return;
    }
    setRecordName("");
    recordNameEditedRef.current = false;
    setFormSections(null);
    setTags([]);
    setCommittedWebsiteUrls([]);
  }, [categoryId, isEditMode, isCopyMode, isTemplateMode]);

  useEffect(() => {
    if (recordNameEditedRef.current) {
      return;
    }
    setRecordName(suggestedRecordName);
  }, [suggestedRecordName]);

  useEffect(() => {
    if (isEditMode || isCopyMode) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const input = recordNameInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [categoryId, isEditMode, isCopyMode, isTemplateMode]);

  const fileBaselineSectionsRef = useRef<KeyFormEditorSection[]>([]);
  useEffect(() => {
    fileBaselineSectionsRef.current = structuredClone(
      initialValues?.sections ?? prefillValues?.sections ?? initialSections,
    );
  }, [initialValues?.itemId, categoryId, initialValues?.sections, prefillValues?.sections, initialSections]);

  useImperativeHandle(
    ref,
    () => ({
      validate: () =>
        validateNewItemForm({
          recordName,
          vaultId,
          sections: formSections ?? initialSections,
        }),
      getSavePayload: () => {
        const sections = formSections ?? initialSections;
        const validation = validateNewItemForm({ recordName, vaultId, sections });
        if (!validation.ok || !category) {
          return null;
        }
        return {
          itemId: itemIdRef.current,
          vaultId,
          folderId,
          recordName: trimmedRecordName,
          categoryId: category.id,
          sections,
          tags,
          createdAtMs: initialValues?.createdAtMs,
        };
      },
      getFileBaselineSections: () => fileBaselineSectionsRef.current,
      getCurrentSections: () => formSections ?? initialSections,
      getFaviconSyncInput: () => getSyncInput(),
      getTemplateSnapshot: () => {
        if (!category) {
          return null;
        }
        return {
          categoryId: category.id,
          recordName: trimmedRecordName,
          vaultId,
          folderId,
          sections: structuredClone(formSections ?? initialSections),
          tags: [...tags],
        };
      },
    }),
    [recordName, vaultId, folderId, formSections, initialSections, category, trimmedRecordName, initialValues, tags, getSyncInput],
  );

  if (!category) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ItemRecordFaviconField
          showUploadControl
          uploadLabel={t("web.newItemPopup.uploadIcon")}
          invalidFileMessage={t("web.newItemPopup.uploadIconInvalid")}
          uploadError={uploadError}
          onUploadFile={uploadIconFile}
        >
          <ItemRecordFavicon
            categoryId={category.id}
            title={trimmedRecordName || undefined}
            faviconId={initialValues?.faviconId ?? prefillValues?.faviconId}
            previewImageSrc={previewImageSrc}
            previewLoading={previewLoading}
            size={40}
            alt=""
          />
        </ItemRecordFaviconField>
        <Input
          ref={recordNameInputRef}
          value={recordName}
          onChange={(event) => {
            recordNameEditedRef.current = true;
            setRecordName(event.target.value);
          }}
          placeholder={t("web.newItemPopup.recordNamePlaceholder", { category: categoryLabel })}
          className={cn(
            "h-10 min-w-0 flex-1 text-xl font-semibold leading-6",
            recordNameInvalid &&
              "border-destructive shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] focus-visible:ring-0",
          )}
          aria-label={t("web.newItemPopup.recordNameLabel")}
          aria-invalid={recordNameInvalid || undefined}
        />
      </div>

      <KeyFormEditor
        key={formInstanceKeyRef.current}
        mode="edit"
        initialSections={initialSections}
        addSectionLabel={t("web.newItemPopup.addSectionWithField")}
        addFieldLabel={t("web.newItemPopup.addField")}
        fieldTypes={keyFormFieldTypes}
        messages={keyFormMessages}
        datePickerLocale={datePickerLocale}
        onSectionsChange={setFormSections}
        onWebsiteUrlsBlur={handleWebsiteUrlsBlur}
        showValidation={showValidation}
      />

      <NewItemTagsSection tags={tags} onTagsChange={setTags} t={t} />

      <NewItemSaveLocationSection
        t={t}
        workspaceName={workspaceName}
        vaults={vaults}
        vaultsListReady={vaultsListReady}
        vaultId={vaultId}
        onVaultIdChange={setVaultId}
        folderId={folderId}
        onFolderIdChange={setFolderId}
      />
    </div>
  );
});

export default NewItemForm;

export function buildItemFromNewItemSavePayload(payload: NewItemSavePayload) {
  return keyFormSectionsToItemPlaintext({
    sections: payload.sections,
    itemId: payload.itemId,
    vaultId: payload.vaultId,
    title: payload.recordName,
    categoryId: payload.categoryId,
    nowMs: payload.createdAtMs,
    tags: payload.tags,
  });
}

export function buildItemFromEditSavePayload(
  payload: NewItemSavePayload,
  existingCreatedAtMs: number,
  existing?: Pick<ItemPlaintextV2, "faviconId" | "faviconSource">,
): ItemPlaintextV2 {
  const built = keyFormSectionsToItemPlaintext({
    sections: payload.sections,
    itemId: payload.itemId,
    vaultId: payload.vaultId,
    title: payload.recordName,
    categoryId: payload.categoryId,
    tags: payload.tags,
  });
  return {
    ...built,
    createdAtMs: existingCreatedAtMs,
    updatedAtMs: Date.now(),
    ...(existing?.faviconId ? { faviconId: existing.faviconId } : {}),
    ...(existing?.faviconSource ? { faviconSource: existing.faviconSource } : {}),
  };
}

export type { NewItemFormValidationIssue };
