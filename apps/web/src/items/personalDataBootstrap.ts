import type { ItemPlaintextV2 } from "@okkey/types";
import {
  PERSONAL_DATA_SECTION_ID,
  getDefaultSectionsForCategory,
  keyFormSectionsToItemPlaintext,
  type KeyFormEditorMessages,
  type KeyFormEditorSection,
} from "@okkey/vault-ui";

export function hasPersonalDataItem(items: readonly ItemPlaintextV2[]): boolean {
  return items.some((item) => item.categoryId === "personal_data" && !item.deleted);
}

function withPrefillValues(
  sections: readonly KeyFormEditorSection[],
  prefill: { firstName?: string; lastName?: string; email?: string },
): KeyFormEditorSection[] {
  const firstName = prefill.firstName?.trim() ?? "";
  const lastName = prefill.lastName?.trim() ?? "";
  const email = prefill.email?.trim() ?? "";

  return sections.map((section) => {
    if (section.id !== PERSONAL_DATA_SECTION_ID) {
      return { ...section, fields: [...section.fields] };
    }
    return {
      ...section,
      fields: section.fields.map((field) => {
        if (field.id === "first-name" && firstName) {
          return { ...field, value: firstName };
        }
        if (field.id === "last-name" && lastName) {
          return { ...field, value: lastName };
        }
        if (field.id === "email" && email) {
          return { ...field, value: email };
        }
        return { ...field };
      }),
    };
  });
}

/**
 * Builds a personal_data item for first workspace unlock: category default sections
 * with Имя / Фамилия / Email prefilled from the account profile.
 */
export function buildPersonalDataBootstrapItem(input: {
  itemId: string;
  vaultId: string;
  title: string;
  messages: KeyFormEditorMessages;
  firstName?: string;
  lastName?: string;
  email?: string;
  nowMs?: number;
}): ItemPlaintextV2 {
  const sections = withPrefillValues(getDefaultSectionsForCategory("personal_data", input.messages), {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
  });

  return keyFormSectionsToItemPlaintext({
    sections,
    itemId: input.itemId,
    vaultId: input.vaultId,
    title: input.title,
    categoryId: "personal_data",
    nowMs: input.nowMs,
  });
}
