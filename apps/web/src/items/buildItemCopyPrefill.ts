import type { ItemPlaintextV2 } from "@okkey/types";

import type { NewItemFormPrefillValues } from "../components/items/NewItemForm";
import type { KeyFormEditorMessages } from "../components/key-form/keyFormI18n";
import { itemPlaintextToKeyFormSections } from "./itemPlaintextToKeyFormSections";

export function buildItemCopyPrefillValues(
  item: ItemPlaintextV2,
  folderId: string,
  messages: KeyFormEditorMessages,
): NewItemFormPrefillValues {
  return {
    recordName: item.title,
    vaultId: item.vaultId,
    folderId,
    sections: structuredClone(itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true })),
    tags: [...(item.tags ?? [])],
    ...(item.faviconId ? { faviconId: item.faviconId } : {}),
    ...(item.faviconSource ? { faviconSource: item.faviconSource } : {}),
  };
}
