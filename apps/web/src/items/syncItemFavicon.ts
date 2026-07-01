import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";

import { clearItemFavicon, upsertItemFavicon } from "../api/item-favicons";

function collectUrls(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
}

export function applyFaviconIdToItem(item: ItemPlaintextV2, faviconId?: string): ItemPlaintextV2 {
  if (!faviconId) {
    const { faviconId: _removed, ...rest } = item;
    return rest;
  }
  return { ...item, faviconId };
}

/** Persist favicon to MinIO only when saving the item (not during form preview). */
export async function syncItemFaviconForPlaintext(
  accessToken: string,
  item: ItemPlaintextV2,
  previous?: ItemPlaintextV2,
): Promise<ItemPlaintextV2> {
  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    if (previous?.faviconId) {
      await clearItemFavicon(accessToken, item.vaultId, item.itemId);
    }
    return applyFaviconIdToItem(item, undefined);
  }

  const urls = collectUrls(item);

  if (urls.length === 0) {
    if (previous?.faviconId) {
      await clearItemFavicon(accessToken, item.vaultId, item.itemId);
    }
    return applyFaviconIdToItem(item, undefined);
  }

  const result = await upsertItemFavicon(accessToken, item.vaultId, item.itemId, urls);
  return applyFaviconIdToItem(item, result.faviconId ?? undefined);
}
