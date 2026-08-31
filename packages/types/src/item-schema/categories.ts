import type { EntityId } from "../entity-id.js";
import type { ItemFieldV2, ItemSectionV2, ItemPlaintextV2 } from "./types.js";
import {
  ITEM_CATEGORY_CREDIT_CARD,
  ITEM_CATEGORY_LOGIN,
  ITEM_CATEGORY_SECURE_NOTE,
  ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
} from "./types.js";
import { emptyValueForFieldType } from "./field-defaults.js";

export interface CategoryDefinition {
  id: string;
  displayNameKey: string;
  sections: ItemSectionV2[];
  /** Field templates (values filled with empties by {@link createPresetItemPlaintextV2}). */
  fieldTemplates: Omit<ItemFieldV2, "value">[];
}

/** Aligns with web UI presets (`itemCategoryDefaultSections`). */
const SEC_LOGIN_CREDENTIALS = "credentials";
const SEC_LOGIN_WEBSITES = "websites";
const SEC_NOTE = "secure-note";
const SEC_CARD = "credit-card";

export const ITEM_CATEGORY_DEFINITIONS: Record<string, CategoryDefinition> = {
  [ITEM_CATEGORY_LOGIN]: {
    id: ITEM_CATEGORY_LOGIN,
    displayNameKey: "itemCategory.login",
    sections: [
      { id: SEC_LOGIN_CREDENTIALS, title: "General", order: 0, isPreset: true },
      { id: SEC_LOGIN_WEBSITES, title: "Websites", order: 1, isPreset: true },
    ],
    fieldTemplates: [
      { id: "login", type: "text", sectionId: SEC_LOGIN_CREDENTIALS, order: 0, label: "Login" },
      { id: "password", type: "password", sectionId: SEC_LOGIN_CREDENTIALS, order: 1, label: "Password" },
      { id: "website-1", type: "url", sectionId: SEC_LOGIN_WEBSITES, order: 0, label: "Website" },
    ],
  },
  [ITEM_CATEGORY_SECURE_NOTE]: {
    id: ITEM_CATEGORY_SECURE_NOTE,
    displayNameKey: "itemCategory.secureNote",
    sections: [{ id: SEC_NOTE, title: "Note", order: 0, isPreset: true }],
    fieldTemplates: [
      { id: "note", type: "note", sectionId: SEC_NOTE, order: 0, label: "Note" },
    ],
  },
  [ITEM_CATEGORY_CREDIT_CARD]: {
    id: ITEM_CATEGORY_CREDIT_CARD,
    displayNameKey: "itemCategory.creditCard",
    sections: [{ id: SEC_CARD, title: "Credit card", order: 0, isPreset: true }],
    fieldTemplates: [
      { id: "card-number", type: "text", sectionId: SEC_CARD, order: 0, label: "Card number" },
      { id: "card-expiry", type: "text", sectionId: SEC_CARD, order: 1, label: "Expiry" },
      { id: "card-pin", type: "password", sectionId: SEC_CARD, order: 2, label: "PIN / CVV" },
      { id: "card-holder", type: "text", sectionId: SEC_CARD, order: 3, label: "Cardholder" },
    ],
  },
};

export function listCategoryIds(): string[] {
  return Object.keys(ITEM_CATEGORY_DEFINITIONS);
}

export function getCategoryDefinition(categoryId: string): CategoryDefinition | undefined {
  return ITEM_CATEGORY_DEFINITIONS[categoryId];
}

/**
 * New item with preset sections/fields for a category (empty values).
 * Custom sections/fields are appended later by clients (5.3+); order rules: presets first.
 */
export function createPresetItemPlaintextV2(params: {
  categoryId: string;
  itemId: EntityId;
  vaultId: EntityId;
  title: string;
  nowMs?: number;
}): ItemPlaintextV2 {
  const def = getCategoryDefinition(params.categoryId);
  if (!def) {
    throw new Error(`Unknown item category: ${params.categoryId}`);
  }
  const now = params.nowMs ?? Date.now();
  const sections = def.sections.map((s) => ({ ...s }));
  const fields: ItemFieldV2[] = def.fieldTemplates.map((t) => ({
    ...t,
    value: emptyValueForFieldType(t.type),
  }));
  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: params.itemId,
    vaultId: params.vaultId,
    title: params.title,
    categoryId: def.id,
    createdAtMs: now,
    updatedAtMs: now,
    sections,
    fields,
  };
}
