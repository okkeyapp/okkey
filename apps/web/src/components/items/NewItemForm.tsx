import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import { Input } from "@okkey/ui";
import { useMemo, useState } from "react";

import { KeyFormEditor } from "../key-form/KeyFormEditor";
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
  const category = getItemCategoryDefinition(categoryId);
  const categoryLabel = category ? getCategoryLabel(t, category) : categoryId;
  const [recordName, setRecordName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [vaultId, setVaultId] = useSyncedNewItemVaultId(vaults, vaultsListReady);
  const [folderId, setFolderId] = useState(NO_FOLDER_VALUE);
  const initialSections = useMemo(
    () => (category ? getDefaultSectionsForCategory(category.id) : []),
    [category],
  );

  if (!category) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: category.iconColor }}
          aria-hidden
        >
          <ItemCategoryIcon categoryId={category.id} pixelSize={24} className="shrink-0 text-white" />
        </div>
        <Input
          value={recordName}
          onChange={(event) => setRecordName(event.target.value)}
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
