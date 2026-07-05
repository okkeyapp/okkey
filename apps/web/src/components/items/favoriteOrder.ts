export const FAVORITE_ORDER_CATEGORY_PREFIX = "category:";
export const FAVORITE_ORDER_TEMPLATE_PREFIX = "template:";

export type FavoriteOrderEntry = {
  type: "category" | "template";
  id: string;
};

export function encodeFavoriteOrderEntry(type: FavoriteOrderEntry["type"], id: string): string {
  return `${type === "category" ? FAVORITE_ORDER_CATEGORY_PREFIX : FAVORITE_ORDER_TEMPLATE_PREFIX}${id}`;
}

export function parseFavoriteOrderEntry(value: string): FavoriteOrderEntry | null {
  if (value.startsWith(FAVORITE_ORDER_CATEGORY_PREFIX)) {
    const id = value.slice(FAVORITE_ORDER_CATEGORY_PREFIX.length).trim();
    return id ? { type: "category", id } : null;
  }
  if (value.startsWith(FAVORITE_ORDER_TEMPLATE_PREFIX)) {
    const id = value.slice(FAVORITE_ORDER_TEMPLATE_PREFIX.length).trim();
    return id ? { type: "template", id } : null;
  }
  return null;
}

export function buildDefaultFavoriteOrder(
  favoriteCategoryIds: readonly string[],
  favoriteTemplateIds: readonly string[],
): string[] {
  return [
    ...favoriteCategoryIds.map((id) => encodeFavoriteOrderEntry("category", id)),
    ...favoriteTemplateIds.map((id) => encodeFavoriteOrderEntry("template", id)),
  ];
}

export function reconcileFavoriteOrder(
  order: readonly string[],
  favoriteCategoryIds: readonly string[],
  favoriteTemplateIds: readonly string[],
): string[] {
  const categorySet = new Set(favoriteCategoryIds);
  const templateSet = new Set(favoriteTemplateIds);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of order) {
    const parsed = parseFavoriteOrderEntry(entry);
    if (!parsed || seen.has(entry)) {
      continue;
    }
    if (parsed.type === "category" && categorySet.has(parsed.id)) {
      seen.add(entry);
      result.push(entry);
    }
    if (parsed.type === "template" && templateSet.has(parsed.id)) {
      seen.add(entry);
      result.push(entry);
    }
  }

  for (const id of favoriteCategoryIds) {
    const entry = encodeFavoriteOrderEntry("category", id);
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  for (const id of favoriteTemplateIds) {
    const entry = encodeFavoriteOrderEntry("template", id);
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }

  return result;
}
