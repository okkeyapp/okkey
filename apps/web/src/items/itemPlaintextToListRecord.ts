import type { ItemPlaintextV2 } from "@okkey/types";

import type { ItemsListRecord } from "../components/workspace/ItemsListLeftPane";

function readTextField(item: ItemPlaintextV2, fieldId: string): string {
  const field = item.fields.find((candidate) => candidate.id === fieldId);
  if (!field) {
    return "";
  }
  if (field.value.kind === "text") {
    return field.value.text;
  }
  if (field.value.kind === "password") {
    return field.value.password;
  }
  return "";
}

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
  const login = readTextField(item, "login") || readTextField(item, item.fields.find((field) => field.type === "text")?.id ?? "");

  return {
    id: item.itemId,
    vaultId: item.vaultId,
    folderId: input.folderId,
    urls: collectUrls(item),
    title: item.title,
    login,
    tags: [...(item.tags ?? [])],
    date: new Date(item.updatedAtMs),
    favorite: input.favorite,
    archived: false,
    deleted: false,
  };
}
