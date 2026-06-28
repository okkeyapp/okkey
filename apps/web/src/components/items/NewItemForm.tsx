import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Favicon, Input, cn } from "@okkey/ui";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";
import { collectWebsiteUrlsFromSections, suggestedRecordTitleFromWebsiteUrls } from "../../lib/domainRecordTitle";
import { keyFormSectionsToItemPlaintext } from "../../items/keyFormToItemPlaintext";
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
import { ItemCategoryIcon } from "./itemCategoryIcons";
import NewItemSaveLocationSection, { useSyncedNewItemVaultId } from "./NewItemSaveLocationSection";
import NewItemTagsSection from "./NewItemTagsSection";
import { generateEntityId } from "@okkey/types";

export type NewItemSavePayload = {
  itemId: string;
  vaultId: string;
  folderId: string;
  recordName: string;
  categoryId: string;
  sections: KeyFormEditorSection[];
};

export type NewItemFormHandle = {
  validate: () => NewItemFormValidationResult;
  getSavePayload: () => NewItemSavePayload | null;
};

type NewItemFormProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  categoryId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
  showValidation?: boolean;
};

const NewItemForm = forwardRef<NewItemFormHandle, NewItemFormProps>(function NewItemForm(
  { t, categoryId, workspaceName, vaults, vaultsListReady, showValidation = false },
  ref,
) {
  const { locale } = useLocale();
  const category = getItemCategoryDefinition(categoryId);
  const categoryLabel = category ? getCategoryLabel(t, category) : categoryId;
  const [recordName, setRecordName] = useState("");
  const recordNameEditedRef = useRef(false);
  const [formSections, setFormSections] = useState<KeyFormEditorSection[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [vaultId, setVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  const [folderId, setFolderId] = useState(NO_FOLDER_VALUE);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const keyFormFieldTypes = useMemo(() => createLocalizedKeyFieldTypes(locale), [locale]);
  const initialSections = useMemo(
    () => (category ? getDefaultSectionsForCategory(category.id, keyFormMessages) : []),
    [category, keyFormMessages],
  );
  const [committedWebsiteUrls, setCommittedWebsiteUrls] = useState<string[]>([]);
  const suggestedRecordName = useMemo(
    () => suggestedRecordTitleFromWebsiteUrls(committedWebsiteUrls),
    [committedWebsiteUrls],
  );
  const trimmedRecordName = recordName.trim();
  const recordNameInvalid = showValidation && trimmedRecordName.length === 0;

  const handleWebsiteUrlsBlur = useCallback((sections: KeyFormEditorSection[]) => {
    setCommittedWebsiteUrls(collectWebsiteUrlsFromSections(sections));
  }, []);

  useEffect(() => {
    setRecordName("");
    recordNameEditedRef.current = false;
    setFormSections(null);
    setCommittedWebsiteUrls([]);
  }, [categoryId]);

  useEffect(() => {
    if (recordNameEditedRef.current) {
      return;
    }
    setRecordName(suggestedRecordName);
  }, [suggestedRecordName]);

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
          itemId: generateEntityId(),
          vaultId,
          folderId,
          recordName: trimmedRecordName,
          categoryId: category.id,
          sections,
        };
      },
    }),
    [recordName, vaultId, folderId, formSections, initialSections, category, trimmedRecordName],
  );

  if (!category) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Favicon
          name={trimmedRecordName || undefined}
          urls={committedWebsiteUrls.length > 0 ? committedWebsiteUrls : undefined}
          size={40}
          color={category.iconColor}
          icon={<ItemCategoryIcon categoryId={category.id} pixelSize={22} className="shrink-0 text-white" />}
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
            recordNameInvalid && "border-destructive focus-visible:ring-destructive/30",
          )}
          aria-label={t("web.newItemPopup.recordNameLabel")}
          aria-invalid={recordNameInvalid || undefined}
        />
      </div>
      {recordNameInvalid ? (
        <p className="text-sm text-destructive">{t("web.newItemPopup.validation.recordNameRequired")}</p>
      ) : null}

      <KeyFormEditor
        key={category.id}
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
  });
}

export type { NewItemFormValidationIssue };
