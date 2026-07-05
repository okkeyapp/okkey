import type { ItemFaviconSource, ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";

import { clearItemFavicon, upsertItemFavicon, upsertItemFaviconPng } from "../api/item-favicons";
import type { ItemFormFaviconSyncInput } from "./useItemFormFavicon";

function collectUrls(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
}

export function applyFaviconToItem(
  item: ItemPlaintextV2,
  faviconId?: string,
  faviconSource?: ItemFaviconSource,
): ItemPlaintextV2 {
  const next: ItemPlaintextV2 = { ...item };
  if (faviconId) {
    next.faviconId = faviconId;
  } else {
    delete next.faviconId;
  }
  if (faviconSource) {
    next.faviconSource = faviconSource;
  } else {
    delete next.faviconSource;
  }
  return next;
}

/** Persist favicon to MinIO only when saving the item (not during form preview). */
export async function syncItemFaviconForPlaintext(
  accessToken: string,
  item: ItemPlaintextV2,
  previous?: ItemPlaintextV2,
  syncInput?: ItemFormFaviconSyncInput,
): Promise<ItemPlaintextV2> {
  const faviconSource = syncInput?.faviconSource ?? item.faviconSource;

  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    const result = await upsertItemFaviconPng(accessToken, item.vaultId, item.itemId, syncInput.manualFaviconPng);
    const faviconId = result.faviconId?.trim();
    if (!faviconId) {
      throw new Error("FAVICON_MANUAL_UPLOAD_FAILED");
    }
    return applyFaviconToItem(item, faviconId, "manual");
  }

  if (faviconSource === "manual") {
    const faviconId =
      item.faviconId ??
      previous?.faviconId ??
      (syncInput?.reuseFaviconId?.trim() || undefined);
    return applyFaviconToItem(item, faviconId, "manual");
  }

  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    if (previous?.faviconId) {
      await clearItemFavicon(accessToken, item.vaultId, item.itemId);
    }
    return applyFaviconToItem(item, undefined, undefined);
  }

  const urls = collectUrls(item);

  if (urls.length === 0) {
    if (previous?.faviconId) {
      await clearItemFavicon(accessToken, item.vaultId, item.itemId);
    }
    return applyFaviconToItem(item, undefined, undefined);
  }

  const result = await upsertItemFavicon(accessToken, item.vaultId, item.itemId, urls);
  return applyFaviconToItem(item, result.faviconId ?? undefined, "website");
}
