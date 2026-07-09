import type { ItemPlaintextV2 } from "@okkey/types";

import type { ItemsListRecord } from "../components/workspace/ItemsListLeftPane";
import { readItemListRecordDescription } from "./itemListRecordDescription";

function collectUrls(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
}

export function itemPlaintextToListRecord(
  item: ItemPlaintextV2,
  input: { folderId: string | null; favorite: boolean },
): ItemsListRecord {
  return {
    id: item.itemId,
    vaultId: item.vaultId,
    folderId: input.folderId,
    categoryId: item.categoryId,
    urls: collectUrls(item),
    ...(item.faviconId ? { faviconId: item.faviconId } : {}),
    title: item.title,
    description: readItemListRecordDescription(item),
    tags: [...(item.tags ?? [])],
    date: new Date(item.updatedAtMs),
    favorite: input.favorite,
    archived: item.archived ?? false,
    deleted: item.deleted ?? false,
    ...(item.deletedAtMs !== undefined ? { deletedAtMs: item.deletedAtMs } : {}),
  };
}
