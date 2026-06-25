import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";

import { getItemCategoryDefinition } from "./itemCategoryCatalog";

type NewItemFormPlaceholderProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  categoryId: string;
  onBack: () => void;
};

export default function NewItemFormPlaceholder({ t, categoryId, onBack }: NewItemFormPlaceholderProps) {
  const category = getItemCategoryDefinition(categoryId);
  const title = category ? t(category.labelKey) : categoryId;

  return (
    <div className="flex min-h-[420px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="h-9 rounded-lg px-3 text-sm" onClick={onBack}>
          {t("web.newItemPopup.backToCategories")}
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        {t("web.newItemPopup.formPlaceholder", { category: title })}
      </div>
    </div>
  );
}
