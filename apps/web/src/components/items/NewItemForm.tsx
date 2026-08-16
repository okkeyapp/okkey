import type { ItemFaviconSource } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import type { ItemPlaintextV2, Vault } from "@okkey/types";
import { generateEntityId } from "@okkey/types";
import { Input, cn, serializeKeyFieldFileValue } from "@okkey/ui";
import type { KeyFieldFileValue } from "@okkey/ui";
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
import { createKeyFormEditorMessages, createLocalizedKeyFieldTypes, filterKeyFieldTypesForFilesEnabled } from "../key-form/keyFormI18n";
import { getCategoryLabel } from "./NewItemCategoryCard";
import { getItemCategoryDefinition } from "./itemCategoryCatalog";
import { getDefaultSectionsForCategory } from "./itemCategoryDefaultSections";
import ItemRecordFavicon from "./ItemRecordFavicon";
import { ItemRecordFaviconField } from "./ItemRecordFaviconField";
import NewItemSaveLocationSection, { useSyncedNewItemVaultId } from "./NewItemSaveLocationSection";
import NewItemTagsSection from "./NewItemTagsSection";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import {
  downloadKeyFieldFileAttachmentBytes,
  downloadKeyFieldFileAttachment,
  uploadEncryptedAttachment,
} from "../../api/key-field-files";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";

export type NewItemSavePayload = {
  itemId: string;
  vaultId: string;
  folderId: string;
  recordName: string;
  categoryId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  attachmentItemId?: string;
  createdAtMs?: number;
};

export type PendingFileUploadResult = {
  payload: NewItemSavePayload;
  uploadedFiles: KeyFieldFileValue[];
};

export type NewItemFormPrefillValues = {
  recordName: string;
  vaultId: string;
  folderId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  attachmentItemId?: string;
  faviconId?: string;
  faviconItemId?: string;
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
  attachmentItemId?: string;
  faviconId?: string;
  faviconItemId?: string;
  faviconSource?: ItemFaviconSource;
};

export type NewItemFormHandle = {
  validate: () => NewItemFormValidationResult;
  getSavePayload: () => NewItemSavePayload | null;
  uploadPendingFiles: (
    payload: NewItemSavePayload,
    options?: { targetItemId?: string; sourceItemId?: string },
  ) => Promise<PendingFileUploadResult>;
  getFileBaselineSections: () => KeyFormEditorSection[];
  getCurrentSections: () => KeyFormEditorSection[];
  getFaviconSyncInput: () => ItemFormFaviconSyncInput;
  getTemplateSnapshot: () => ItemTemplateFormSnapshot | null;
  hasUnsavedChanges: () => boolean;
  /** Item payload changes only (excludes personal folder assignment). */
  hasItemContentChanges: () => boolean;
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
  onCanSaveChange?: (canSave: boolean) => void;
};

const NewItemForm = forwardRef<NewItemFormHandle, NewItemFormProps>(function NewItemForm(
  {
    t,
    categoryId,
    workspaceName,
    vaults,
    vaultsListReady,
    showValidation = false,
    initialValues,
    prefillValues,
    templateName,
    onCanSaveChange,
  },
  ref,
) {
  const isEditMode = Boolean(initialValues);
  const isTemplateMode = Boolean(templateName);
  const isCopyMode = Boolean(prefillValues) && !isTemplateMode;
  const { accessToken } = useAuthVault();
  const { fileUploadConstraints, filesInItemsEnabled, resolveVaultEncryptionKey } = useWorkspaceItems();
  const itemIdRef = useRef(initialValues?.itemId ?? generateEntityId());
  const pendingFileByIdRef = useRef(new Map<string, File>());
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
  const selectedVault = useMemo(() => vaults.find((vault) => vault.id === vaultId), [vaultId, vaults]);
  const itemEncryptionKey = useResolvedVaultEncryptionKey(vaultId || undefined);
  const [folderId, setFolderId] = useState(initialValues?.folderId ?? prefillValues?.folderId ?? NO_FOLDER_VALUE);
  const [syncedVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  useEffect(() => {
    if (!isEditMode && !isCopyMode && !isTemplateMode && syncedVaultId && !vaultId) {
      setVaultId(syncedVaultId);
    }
  }, [isEditMode, isCopyMode, isTemplateMode, syncedVaultId, vaultId]);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const keyFormFieldTypes = useMemo(
    () => filterKeyFieldTypesForFilesEnabled(createLocalizedKeyFieldTypes(locale), filesInItemsEnabled),
    [locale, filesInItemsEnabled],
  );
  const resolveFileVaultContext = useCallback(async () => {
    if (!accessToken) {
      throw new Error("AUTH_REQUIRED");
    }
    if (!selectedVault) {
      throw new Error("VAULT_REQUIRED");
    }
    const vaultKey = itemEncryptionKey ?? (await resolveVaultEncryptionKey(selectedVault.id));
    return {
      accessToken,
      vaultId: selectedVault.id,
      itemId: itemIdRef.current,
      vaultKey,
    };
  }, [accessToken, itemEncryptionKey, resolveVaultEncryptionKey, selectedVault]);
  const resolveAttachmentContext = useCallback(
    async (itemId: string) => ({
      ...(await resolveFileVaultContext()),
      itemId,
    }),
    [resolveFileVaultContext],
  );
  const handleFileUpload = useCallback(async (file: File): Promise<KeyFieldFileValue> => {
    const pendingAttachmentId = `pending:${generateEntityId()}`;
    pendingFileByIdRef.current.set(pendingAttachmentId, file);
    return {
      attachmentId: pendingAttachmentId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      url: URL.createObjectURL(file),
    };
  }, []);
  const sourceAttachmentItemId =
    initialValues?.attachmentItemId ??
    prefillValues?.attachmentItemId ??
    initialValues?.itemId ??
    itemIdRef.current;
  const handleFileOpen = useCallback(
    async (file: KeyFieldFileValue) => {
      const context = await resolveAttachmentContext(
        pendingFileByIdRef.current.has(file.attachmentId) ? itemIdRef.current : sourceAttachmentItemId,
      );
      return downloadKeyFieldFileAttachment({
        ...context,
        file,
      });
    },
    [resolveAttachmentContext, sourceAttachmentItemId],
  );
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
  const currentSections = formSections ?? initialSections;
  const faviconState = useItemFormFavicon({
    accessToken,
    categoryId,
    urls: committedWebsiteUrls,
    initialFaviconId: initialValues?.faviconId ?? prefillValues?.faviconId,
    initialFaviconItemId: initialValues?.faviconItemId ?? prefillValues?.faviconItemId ?? initialValues?.itemId,
    initialFaviconSource: initialValues?.faviconSource ?? prefillValues?.faviconSource,
  });
  const {
    previewImageSrc,
    previewLoading,
    uploadError,
    uploadIconFile,
    getSyncInput,
  } = faviconState;
  const initialFaviconId = initialValues?.faviconId ?? prefillValues?.faviconId;
  const storedFaviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey: itemEncryptionKey,
    vaultId,
    itemId: initialValues?.faviconItemId ?? prefillValues?.faviconItemId ?? initialValues?.itemId ?? itemIdRef.current,
    faviconId: initialFaviconId,
    enabled: Boolean(itemEncryptionKey) && !previewImageSrc,
  });

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
  const formBaselineRef = useRef<{
    recordName: string;
    vaultId: string;
    folderId: string;
    sectionsJson: string;
    tagsJson: string;
  } | null>(null);
  const formBaselineCapturedRef = useRef(false);
  const [formBaselineReady, setFormBaselineReady] = useState(false);
  useEffect(() => {
    fileBaselineSectionsRef.current = structuredClone(
      initialValues?.sections ?? prefillValues?.sections ?? initialSections,
    );
  }, [initialValues?.itemId, categoryId, initialValues?.sections, prefillValues?.sections, initialSections]);

  useEffect(() => {
    formBaselineCapturedRef.current = false;
    formBaselineRef.current = null;
    setFormBaselineReady(false);
  }, [categoryId, prefillValues, templateName, initialValues?.itemId]);

  useEffect(() => {
    if (formBaselineCapturedRef.current) {
      return;
    }
    if (!vaultsListReady) {
      return;
    }
    if (!isEditMode && !vaultId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (formBaselineCapturedRef.current) {
        return;
      }
      formBaselineRef.current = {
        recordName: trimmedRecordName,
        vaultId,
        folderId,
        sectionsJson: JSON.stringify(formSections ?? initialSections),
        tagsJson: JSON.stringify(tags),
      };
      formBaselineCapturedRef.current = true;
      setFormBaselineReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    folderId,
    formSections,
    initialSections,
    isEditMode,
    tags,
    templateName,
    trimmedRecordName,
    vaultId,
    vaultsListReady,
  ]);

  const hasItemContentChanges = useCallback(() => {
    if (pendingFileByIdRef.current.size > 0) {
      return true;
    }
    const faviconSyncInput = getSyncInput();
    if (faviconSyncInput.manualFaviconPng && faviconSyncInput.manualFaviconPng.byteLength > 0) {
      return true;
    }

    const baseline = formBaselineRef.current;
    if (!baseline) {
      return false;
    }

    const sections = formSections ?? initialSections;
    if (JSON.stringify(sections) !== baseline.sectionsJson) {
      return true;
    }
    if (JSON.stringify(tags) !== baseline.tagsJson) {
      return true;
    }
    if (vaultId !== baseline.vaultId) {
      return true;
    }
    if (recordNameEditedRef.current && trimmedRecordName !== baseline.recordName) {
      return true;
    }

    return false;
  }, [formBaselineReady, formSections, getSyncInput, initialSections, tags, trimmedRecordName, vaultId]);

  const hasUnsavedChanges = useCallback(() => {
    if (hasItemContentChanges()) {
      return true;
    }
    const baseline = formBaselineRef.current;
    if (!baseline) {
      return false;
    }
    return folderId !== baseline.folderId;
  }, [folderId, formBaselineReady, hasItemContentChanges]);

  const formIsValid = useMemo(
    () =>
      validateNewItemForm({
        recordName,
        vaultId,
        sections: currentSections,
        categoryId: category?.id,
      }).ok,
    [recordName, vaultId, currentSections, category?.id],
  );

  const canSave = useMemo(() => {
    if (!formIsValid) {
      return false;
    }
    if (!isEditMode) {
      return true;
    }
    if (!formBaselineReady) {
      return false;
    }
    return hasUnsavedChanges();
  }, [formBaselineReady, formIsValid, hasUnsavedChanges, isEditMode]);

  useEffect(() => {
    onCanSaveChange?.(canSave);
  }, [canSave, onCanSaveChange]);

  useImperativeHandle(
    ref,
    () => ({
      validate: () =>
        validateNewItemForm({
          recordName,
          vaultId,
          sections: formSections ?? initialSections,
          categoryId: category.id,
        }),
      getSavePayload: () => {
        const sections = formSections ?? initialSections;
        const validation = validateNewItemForm({ recordName, vaultId, sections, categoryId: category.id });
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
      uploadPendingFiles: async (payload, options) => {
        const targetItemId = options?.targetItemId ?? payload.itemId;
        const sourceItemId =
          options?.sourceItemId ??
          initialValues?.attachmentItemId ??
          prefillValues?.attachmentItemId ??
          initialValues?.itemId ??
          payload.itemId;
        const pendingIdsInPayload = new Set<string>();
        const attachmentsToCopy = new Map<string, KeyFieldFileValue>();
        for (const section of payload.sections) {
          for (const field of section.fields) {
            if (field.type !== "file" || typeof field.value !== "string") {
              continue;
            }
            try {
              const parsed = JSON.parse(field.value) as Partial<KeyFieldFileValue>;
              if (typeof parsed.attachmentId === "string" && pendingFileByIdRef.current.has(parsed.attachmentId)) {
                pendingIdsInPayload.add(parsed.attachmentId);
              } else if (
                typeof parsed.attachmentId === "string" &&
                typeof parsed.name === "string" &&
                typeof parsed.mimeType === "string" &&
                typeof parsed.sizeBytes === "number" &&
                sourceItemId !== targetItemId
              ) {
                attachmentsToCopy.set(parsed.attachmentId, {
                  attachmentId: parsed.attachmentId,
                  name: parsed.name,
                  mimeType: parsed.mimeType,
                  sizeBytes: parsed.sizeBytes,
                });
              }
            } catch {
              /* ignore malformed draft value */
            }
          }
        }

        for (const pendingId of pendingFileByIdRef.current.keys()) {
          if (!pendingIdsInPayload.has(pendingId)) {
            pendingFileByIdRef.current.delete(pendingId);
          }
        }

        const pendingEntries = [...pendingFileByIdRef.current.entries()].filter(([pendingId]) => pendingIdsInPayload.has(pendingId));
        if (pendingEntries.length === 0 && attachmentsToCopy.size === 0) {
          return { payload, uploadedFiles: [] };
        }

        const uploadedByPendingId = new Map<string, KeyFieldFileValue>();
        for (const [pendingId, file] of pendingEntries) {
          const uploadContext = await resolveAttachmentContext(targetItemId);
          const uploaded = await uploadEncryptedAttachment({
            ...uploadContext,
            plaintext: new Uint8Array(await file.arrayBuffer()),
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          });
          uploadedByPendingId.set(pendingId, uploaded);
        }
        const uploadedByCopiedId = new Map<string, KeyFieldFileValue>();
        for (const file of attachmentsToCopy.values()) {
          const downloadContext = await resolveAttachmentContext(sourceItemId);
          const downloaded = await downloadKeyFieldFileAttachmentBytes({
            ...downloadContext,
            file,
          });
          const uploadContext = await resolveAttachmentContext(targetItemId);
          const uploaded = await uploadEncryptedAttachment({
            ...uploadContext,
            plaintext: downloaded.plaintext,
            name: file.name,
            mimeType: file.mimeType || downloaded.mimeType,
            sizeBytes: downloaded.sizeBytes,
          });
          uploadedByCopiedId.set(file.attachmentId, uploaded);
        }

        const sections = payload.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (field.type !== "file" || typeof field.value !== "string") {
              return field;
            }
            try {
              const parsed = JSON.parse(field.value) as Partial<KeyFieldFileValue>;
              const uploaded =
                typeof parsed.attachmentId === "string"
                  ? uploadedByPendingId.get(parsed.attachmentId) ?? uploadedByCopiedId.get(parsed.attachmentId)
                  : undefined;
              if (!uploaded) {
                return field;
              }
              return {
                ...field,
                value: serializeKeyFieldFileValue(uploaded),
              };
            } catch {
              return field;
            }
          }),
        }));
        return {
          payload: { ...payload, itemId: targetItemId, sections },
          uploadedFiles: [...uploadedByPendingId.values(), ...uploadedByCopiedId.values()],
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
          attachmentItemId: sourceAttachmentItemId,
        };
      },
      hasUnsavedChanges: () => hasUnsavedChanges(),
      hasItemContentChanges: () => hasItemContentChanges(),
    }),
    [folderId, formSections, getSyncInput, hasItemContentChanges, hasUnsavedChanges, initialSections, category, trimmedRecordName, initialValues, prefillValues, tags, resolveAttachmentContext, vaultId],
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
            faviconId={initialFaviconId}
            previewImageSrc={previewImageSrc ?? storedFaviconUrl.imageSrc}
            previewLoading={previewLoading || storedFaviconUrl.loading}
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
        onFileUpload={handleFileUpload}
        onFileOpen={handleFileOpen}
        fileUploadConstraints={fileUploadConstraints}
        allowFileFields={filesInItemsEnabled}
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
