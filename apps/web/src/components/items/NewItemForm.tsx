import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Favicon, Input } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { collectWebsiteUrlsFromSections, suggestedRecordTitleFromWebsiteUrls } from "../../lib/domainRecordTitle";
import { useLocale } from "../../locale/LocaleContext";
import { KeyFormEditor, type KeyFormEditorSection } from "../key-form/KeyFormEditor";
import { createKeyFormEditorMessages, createLocalizedKeyFieldTypes } from "../key-form/keyFormI18n";
import { getCategoryLabel } from "./NewItemCategoryCard";
import { getItemCategoryDefinition } from "./itemCategoryCatalog";
import { getDefaultSectionsForCategory } from "./itemCategoryDefaultSections";
import { ItemCategoryIcon } from "./itemCategoryIcons";
import NewItemSaveLocationSection, { useSyncedNewItemVaultId } from "./NewItemSaveLocationSection";
import NewItemTagsSection from "./NewItemTagsSection";
import { NO_FOLDER_VALUE } from "../../folders/workspaceFolderTree";

type NewItemFormProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  categoryId: string;
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

export default function NewItemForm({ t, categoryId, workspaceName, vaults, vaultsListReady }: NewItemFormProps) {
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
          className="h-10 min-w-0 flex-1 text-xl font-semibold leading-6"
          aria-label={t("web.newItemPopup.recordNameLabel")}
        />
      </div>

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
}
