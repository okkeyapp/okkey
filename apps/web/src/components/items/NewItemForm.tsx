import type { WebMessageValues } from "@okkey/i18n";
import { Input } from "@okkey/ui";
import { useMemo, useState } from "react";

import { KeyFormEditor } from "../key-form/KeyFormEditor";
import { getCategoryLabel } from "./NewItemCategoryCard";
import { getItemCategoryDefinition } from "./itemCategoryCatalog";
import { getDefaultSectionsForCategory } from "./itemCategoryDefaultSections";
import { ItemCategoryIcon } from "./itemCategoryIcons";

type NewItemFormProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  categoryId: string;
};

export default function NewItemForm({ t, categoryId }: NewItemFormProps) {
  const category = getItemCategoryDefinition(categoryId);
  const categoryLabel = category ? getCategoryLabel(t, category) : categoryId;
  const [recordName, setRecordName] = useState("");
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
          className="h-10 min-w-0 flex-1 text-xl leading-6"
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
    </div>
  );
}
