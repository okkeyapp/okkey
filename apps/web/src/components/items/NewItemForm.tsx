import type { WebMessageValues } from "@okkey/i18n";
import type { ItemPlaintextV2, Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Input, cn } from "@okkey/ui";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { collectWebsiteUrlsFromSections, suggestedRecordTitleFromWebsiteUrls } from "../../lib/domainRecordTitle";
import { keyFormSectionsToItemPlaintext } from "../../items/keyFormToItemPlaintext";
import { useItemFormFaviconPreview } from "../../items/useItemFormFaviconPreview";
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
};

export type NewItemFormHandle = {
  validate: () => NewItemFormValidationResult;
  getSavePayload: () => NewItemSavePayload | null;
  getFileBaselineSections: () => KeyFormEditorSection[];
  getCurrentSections: () => KeyFormEditorSection[];
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
};

const NewItemForm = forwardRef<NewItemFormHandle, NewItemFormProps>(function NewItemForm(
  { t, categoryId, workspaceName, vaults, vaultsListReady, showValidation = false, initialValues, prefillValues },
  ref,
) {
  const isEditMode = Boolean(initialValues);
  const isCopyMode = Boolean(prefillValues);
  const { accessToken } = useAuthVault();
  const itemIdRef = useRef(initialValues?.itemId ?? generateEntityId());
  const formInstanceKeyRef = useRef(initialValues?.itemId ?? (isCopyMode ? generateEntityId() : categoryId));
  const { locale } = useLocale();
  const category = getItemCategoryDefinition(categoryId);
  const categoryLabel = category ? getCategoryLabel(t, category) : categoryId;
  const [recordName, setRecordName] = useState(initialValues?.recordName ?? prefillValues?.recordName ?? "");
  const recordNameEditedRef = useRef(Boolean(initialValues ?? prefillValues));
  const [formSections, setFormSections] = useState<KeyFormEditorSection[] | null>(
    initialValues?.sections ?? prefillValues?.sections ?? null,
  );
  const [tags, setTags] = useState<string[]>(initialValues?.tags ?? prefillValues?.tags ?? []);
  const [vaultId, setVaultId] = useState(initialValues?.vaultId ?? prefillValues?.vaultId ?? "");
  const [folderId, setFolderId] = useState(initialValues?.folderId ?? prefillValues?.folderId ?? NO_FOLDER_VALUE);
  const [syncedVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  useEffect(() => {
    if (!isEditMode && !isCopyMode && syncedVaultId && !vaultId) {
      setVaultId(syncedVaultId);
    }
  }, [isEditMode, isCopyMode, syncedVaultId, vaultId]);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const keyFormFieldTypes = useMemo(() => createLocalizedKeyFieldTypes(locale), [locale]);
  const initialSections = useMemo(
    () =>
      initialValues?.sections ??
      prefillValues?.sections ??
      (category ? getDefaultSectionsForCategory(category.id, keyFormMessages) : []),
    [initialValues?.sections, prefillValues?.sections, category, keyFormMessages],
  );
  const [committedWebsiteUrls, setCommittedWebsiteUrls] = useState<string[]>(() => {
    const sections = initialValues?.sections ?? prefillValues?.sections;
    return sections ? collectWebsiteUrlsFromSections(sections) : [];
  });
  const suggestedRecordName = useMemo(
    () => suggestedRecordTitleFromWebsiteUrls(committedWebsiteUrls),
    [committedWebsiteUrls],
  );
  const trimmedRecordName = recordName.trim();
  const recordNameInvalid = showValidation && trimmedRecordName.length === 0;
  const { previewImageSrc, isLoading: previewFaviconLoading } = useItemFormFaviconPreview({
    accessToken,
    categoryId,
    urls: committedWebsiteUrls,
  });

  const handleWebsiteUrlsBlur = useCallback((sections: KeyFormEditorSection[]) => {
    setCommittedWebsiteUrls(collectWebsiteUrlsFromSections(sections));
  }, []);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }
    setCommittedWebsiteUrls(collectWebsiteUrlsFromSections(initialValues?.sections ?? []));
  }, [isEditMode, initialValues?.sections]);

  useEffect(() => {
    if (isEditMode || isCopyMode) {
      return;
    }
    setRecordName("");
    recordNameEditedRef.current = false;
    setFormSections(null);
    setTags([]);
    setCommittedWebsiteUrls([]);
  }, [categoryId, isEditMode, isCopyMode]);

  useEffect(() => {
    if (recordNameEditedRef.current) {
      return;
    }
    setRecordName(suggestedRecordName);
  }, [suggestedRecordName]);

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
    }),
    [recordName, vaultId, folderId, formSections, initialSections, category, trimmedRecordName, initialValues, tags],
  );

  if (!category) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ItemRecordFavicon
          categoryId={category.id}
          title={trimmedRecordName || undefined}
          previewImageSrc={previewImageSrc}
          previewLoading={previewFaviconLoading}
          size={40}
          alt=""
        />
        <Input
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

export function buildItemFromEditSavePayload(payload: NewItemSavePayload, existingCreatedAtMs: number): ItemPlaintextV2 {
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
  };
}

export type { NewItemFormValidationIssue };
