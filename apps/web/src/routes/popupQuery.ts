export const POPUP_QUERY_PARAM = "popup";
export const COPY_ITEM_QUERY_PARAM = "copyFrom";
export const SETTINGS_POPUP_ID = "settings";
export const FOLDERS_POPUP_ID = "folders";
export const NEW_ITEM_POPUP_ID = "newItem";
export const EDIT_ITEM_POPUP_ID = "editItem";

export type PopupQuerySearchOptions = {
  copyFromItemId?: string;
};

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

export function popupQuerySearch(
  currentSearch: string,
  value: string | null,
  options?: PopupQuerySearchOptions,
): string {
  const params = new URLSearchParams(currentSearch);
  params.delete(POPUP_QUERY_PARAM);
  params.delete(COPY_ITEM_QUERY_PARAM);
  const baseSearch = params.toString();

  const queryParts: string[] = [];
  if (baseSearch) {
    queryParts.push(baseSearch);
  }
  if (value) {
    queryParts.push(`${POPUP_QUERY_PARAM}=${encodeURIComponent(value).replaceAll("%7C", "|")}`);
  }
  if (options?.copyFromItemId) {
    queryParts.push(`${COPY_ITEM_QUERY_PARAM}=${encodeURIComponent(options.copyFromItemId)}`);
  }

  if (queryParts.length === 0) {
    return "";
  }

  return `?${queryParts.join("&")}`;
}
