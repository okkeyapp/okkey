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
import { isItemCategoryId } from "./itemCategoryCatalog";
import NewItemCategoryPicker from "./NewItemCategoryPicker";
import NewItemFormPlaceholder from "./NewItemFormPlaceholder";
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

  const title = t("web.items.createRecord");

  return (
    <Popup
      id={NEW_ITEM_POPUP_ID}
      header={title}
      closeLabel={t("web.settingsPopup.close")}
      onClose={closePopup}
      panelClassName="min-h-[720px]"
      footer={
        <Button type="button" variant="outline" onClick={closePopup}>
          {t("web.newItemPopup.cancel")}
        </Button>
      }
    >
      {selectedCategoryId ? (
        <NewItemFormPlaceholder t={t} categoryId={selectedCategoryId} onBack={backToCategories} />
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
