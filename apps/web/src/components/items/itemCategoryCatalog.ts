export const ITEM_CATEGORY_GROUP_PERSONAL = "personal" as const;
export const ITEM_CATEGORY_GROUP_AUTHORIZATION = "authorization" as const;
export const ITEM_CATEGORY_GROUP_FINANCE = "finance" as const;

export type ItemCategoryGroupId =
  | typeof ITEM_CATEGORY_GROUP_PERSONAL
  | typeof ITEM_CATEGORY_GROUP_AUTHORIZATION
  | typeof ITEM_CATEGORY_GROUP_FINANCE;

export type ItemCategoryId =
  | "login"
  | "secure_note"
  | "credit_card"
  | "personal_data"
  | "passport"
  | "secure_files"
  | "api_access"
  | "ssh_key"
  | "database"
  | "server"
  | "wifi_router"
  | "bank_account"
  | "crypto_wallet";

export type ItemCategoryDefinition = {
  id: ItemCategoryId;
  labelKey: string;
  iconColor: string;
  groupId?: ItemCategoryGroupId;
};

export const DEFAULT_FAVORITE_CATEGORY_IDS: readonly ItemCategoryId[] = [
  "login",
  "secure_note",
  "credit_card",
  "personal_data",
  "passport",
  "secure_files",
];

export const ITEM_CATEGORY_DEFINITIONS: readonly ItemCategoryDefinition[] = [
  { id: "login", labelKey: "web.newItemPopup.categories.login", iconColor: "#3b82f6", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  { id: "secure_note", labelKey: "web.newItemPopup.categories.secureNote", iconColor: "#facc15", groupId: ITEM_CATEGORY_GROUP_PERSONAL },
  { id: "credit_card", labelKey: "web.newItemPopup.categories.creditCard", iconColor: "#0d9488", groupId: ITEM_CATEGORY_GROUP_FINANCE },
  { id: "personal_data", labelKey: "web.newItemPopup.categories.personalData", iconColor: "#22c55e", groupId: ITEM_CATEGORY_GROUP_PERSONAL },
  { id: "passport", labelKey: "web.newItemPopup.categories.passport", iconColor: "#9f1239", groupId: ITEM_CATEGORY_GROUP_PERSONAL },
  { id: "secure_files", labelKey: "web.newItemPopup.categories.secureFiles", iconColor: "#ef4444", groupId: ITEM_CATEGORY_GROUP_PERSONAL },
  { id: "api_access", labelKey: "web.newItemPopup.categories.apiAccess", iconColor: "#f472b6", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  // { id: "ssh_key", labelKey: "web.newItemPopup.categories.sshKey", iconColor: "#f97316", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  { id: "database", labelKey: "web.newItemPopup.categories.database", iconColor: "#93c5fd", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  { id: "server", labelKey: "web.newItemPopup.categories.server", iconColor: "#8b5cf6", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  { id: "wifi_router", labelKey: "web.newItemPopup.categories.wifiRouter", iconColor: "#111827", groupId: ITEM_CATEGORY_GROUP_AUTHORIZATION },
  { id: "bank_account", labelKey: "web.newItemPopup.categories.bankAccount", iconColor: "#65a30d", groupId: ITEM_CATEGORY_GROUP_FINANCE },
  { id: "crypto_wallet", labelKey: "web.newItemPopup.categories.cryptoWallet", iconColor: "#f59e0b", groupId: ITEM_CATEGORY_GROUP_FINANCE },
];

const categoryById = new Map(ITEM_CATEGORY_DEFINITIONS.map((category) => [category.id, category]));

export function getItemCategoryDefinition(categoryId: string): ItemCategoryDefinition | undefined {
  return categoryById.get(categoryId as ItemCategoryId);
}

export function isItemCategoryId(categoryId: string): categoryId is ItemCategoryId {
  return categoryById.has(categoryId as ItemCategoryId);
}

export const ITEM_CATEGORY_GROUPS: readonly {
  id: ItemCategoryGroupId;
  labelKey: string;
}[] = [
  { id: ITEM_CATEGORY_GROUP_AUTHORIZATION, labelKey: "web.newItemPopup.groups.authorization" },
  { id: ITEM_CATEGORY_GROUP_FINANCE, labelKey: "web.newItemPopup.groups.finance" },
  { id: ITEM_CATEGORY_GROUP_PERSONAL, labelKey: "web.newItemPopup.groups.personal" },
];

const PERSONAL_GROUP_CATEGORY_ORDER: readonly ItemCategoryId[] = [
  "personal_data",
  "passport",
  "secure_files",
  "secure_note",
];

export function categoriesForGroup(groupId: ItemCategoryGroupId): ItemCategoryDefinition[] {
  if (groupId === ITEM_CATEGORY_GROUP_PERSONAL) {
    return PERSONAL_GROUP_CATEGORY_ORDER.map((id) => getItemCategoryDefinition(id)).filter(
      (category): category is ItemCategoryDefinition => Boolean(category),
    );
  }
  return ITEM_CATEGORY_DEFINITIONS.filter((category) => category.groupId === groupId);
}

export function sortCategoriesByFavoriteOrder(
  categoryIds: readonly string[],
  favoriteOrder: readonly string[],
): ItemCategoryDefinition[] {
  const orderIndex = new Map(favoriteOrder.map((id, index) => [id, index]));
  return categoryIds
    .map((id) => getItemCategoryDefinition(id))
    .filter((category): category is ItemCategoryDefinition => Boolean(category))
    .sort((left, right) => {
      const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
}

/** Popup query slug for category ids, e.g. `secure_note` → `secureNote`. */
export function itemCategoryIdToPopupSlug(categoryId: ItemCategoryId): string {
  return categoryId.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Resolves a popup category slug back to an internal category id. */
export function popupSlugToItemCategoryId(slug: string): ItemCategoryId | null {
  const trimmed = slug.trim();
  if (!trimmed) {
    return null;
  }
  const snakeCase = trimmed.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (isItemCategoryId(snakeCase)) {
    return snakeCase;
  }
  return isItemCategoryId(trimmed) ? trimmed : null;
}
