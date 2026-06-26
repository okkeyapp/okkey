import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  NEW_ITEM_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";
import { getItemCategoryDefinition, isItemCategoryId } from "./itemCategoryCatalog";
import { getCategoryLabel } from "./NewItemCategoryCard";
import NewItemCategoryPicker from "./NewItemCategoryPicker";
import NewItemForm from "./NewItemForm";
import { BackChevronIcon } from "./itemCategoryIcons";
import { useItemCategoryPreferences } from "./useItemCategoryPreferences";

type NewItemPopupProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceId: string;
};

export default function NewItemPopup({ t, workspaceId }: NewItemPopupProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === NEW_ITEM_POPUP_ID;
  const selectedCategoryId =
    open && activePopup.menuItemId && isItemCategoryId(activePopup.menuItemId)
      ? activePopup.menuItemId
      : null;

  const { favoriteIds, favoriteIdSet, ready, toggleFavorite, reorderFavorites } =
    useItemCategoryPreferences(workspaceId);

  function closePopup() {
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
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID, categoryId)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function backToCategories() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(NEW_ITEM_POPUP_ID)),
        hash: location.hash,
      },
      { replace: false },
    );
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
        {t("web.newItemPopup.newRecordTitle", { category: selectedCategoryLabel ?? selectedCategoryId })}
      </h2>
    </div>
  ) : (
    t("web.items.createRecord")
  );

  return (
    <Popup
      id={NEW_ITEM_POPUP_ID}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      panelClassName="min-h-[720px]"
      footer={
        selectedCategoryId ? (
          <>
            <Button type="button" variant="outline" onClick={closePopup}>
              {t("web.newItemPopup.cancel")}
            </Button>
            <Button type="button" onClick={() => undefined}>
              {t("web.newItemPopup.save")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={closePopup}>
            {t("web.newItemPopup.cancel")}
          </Button>
        )
      }
    >
      {selectedCategoryId ? (
        <NewItemForm t={t} categoryId={selectedCategoryId} />
      ) : (
        <NewItemCategoryPicker
          t={t}
          favoriteIds={favoriteIds}
          favoriteIdSet={favoriteIdSet}
          ready={ready}
          onToggleFavorite={toggleFavorite}
          onReorderFavorites={reorderFavorites}
          onSelectCategory={selectCategory}
        />
      )}
    </Popup>
  );
}
