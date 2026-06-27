export const POPUP_QUERY_PARAM = "popup";
export const SETTINGS_POPUP_ID = "settings";
export const FOLDERS_POPUP_ID = "folders";
export const NEW_ITEM_POPUP_ID = "new-item";

export function parsePopupQueryValue(value: string | null): { popupId: string; menuItemId?: string } | null {
  if (!value) {
    return null;
  }

  const [popupId, menuItemId] = value.split("|");
  if (!popupId) {
    return null;
  }

  return { popupId, menuItemId };
}

export function buildPopupQueryValue(popupId: string, menuItemId?: string): string {
  return menuItemId ? `${popupId}|${menuItemId}` : popupId;
}

export function popupQuerySearch(currentSearch: string, value: string | null): string {
  const params = new URLSearchParams(currentSearch);
  params.delete(POPUP_QUERY_PARAM);
  const baseSearch = params.toString();

  if (!value) {
    return baseSearch ? `?${baseSearch}` : "";
  }

  const popupSearch = `${POPUP_QUERY_PARAM}=${encodeURIComponent(value).replaceAll("%7C", "|")}`;
  return baseSearch ? `?${baseSearch}&${popupSearch}` : `?${popupSearch}`;
}
