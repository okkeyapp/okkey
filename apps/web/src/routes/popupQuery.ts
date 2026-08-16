export const POPUP_QUERY_PARAM = "popup";
export const COPY_ITEM_QUERY_PARAM = "copyFrom";
export const ITEM_TEMPLATE_QUERY_PARAM = "template";
export const SETTINGS_POPUP_ID = "settings";
export const FOLDERS_POPUP_ID = "folders";
export const NEW_ITEM_POPUP_ID = "newItem";
export const EDIT_ITEM_POPUP_ID = "editItem";
export const NEW_ROLE_POPUP_ID = "newRole";
export const EDIT_ROLE_POPUP_ID = "editRole";
export const NEW_PROFILE_POPUP_ID = "newProfile";
export const EDIT_PROFILE_POPUP_ID = "editProfile";
export const NEW_VAULT_POPUP_ID = "newVault";
export const EDIT_VAULT_POPUP_ID = "editVault";
export const INVITE_MEMBERS_POPUP_ID = "inviteMembers";
export const EDIT_MEMBER_POPUP_ID = "editMember";
export const NEW_CAPSULE_POPUP_ID = "newCapsule";
export const CAPSULE_FROM_ITEM_QUERY_PARAM = "capsuleFromItem";

export type PopupQuerySearchOptions = {
  copyFromItemId?: string;
  templateId?: string;
  capsuleFromItemId?: string;
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
  params.delete(ITEM_TEMPLATE_QUERY_PARAM);
  params.delete(CAPSULE_FROM_ITEM_QUERY_PARAM);
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
  if (options?.templateId) {
    queryParts.push(`${ITEM_TEMPLATE_QUERY_PARAM}=${encodeURIComponent(options.templateId)}`);
  }
  if (options?.capsuleFromItemId) {
    queryParts.push(
      `${CAPSULE_FROM_ITEM_QUERY_PARAM}=${encodeURIComponent(options.capsuleFromItemId)}`,
    );
  }

  if (queryParts.length === 0) {
    return "";
  }

  return `?${queryParts.join("&")}`;
}
