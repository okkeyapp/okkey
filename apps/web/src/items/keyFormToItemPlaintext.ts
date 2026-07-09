import type { ItemFieldV2, ItemPlaintextV2, ItemSectionV2 } from "@okkey/types";
import { ITEM_PLAINTEXT_SCHEMA_VERSION_V2 } from "@okkey/types";
import type { EntityId } from "@okkey/types";
import { parseKeyFieldFileValue, serializeKeyFieldSecretRaw } from "@okkey/ui";

import type { KeyFormEditorField, KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import { serializeSelectFieldValue } from "./keyFormSelectField";

function sectionsForItemPlaintext(sections: readonly KeyFormEditorSection[]): KeyFormEditorSection[] {
  return sections
    .map((section) => ({ ...section, fields: [...section.fields] }))
    .filter((section) => section.fields.length > 0);
}

const DEFAULT_SECTION_TITLES: Record<string, string> = {
  credentials: "General",
  websites: "Websites",
  "api-access": "API Access",
  database: "Database",
  "wifi-router": "Wi‑Fi router",
  "credit-card": "Credit card",
  "admin-console": "Admin console",
  "bank-details": "Bank details",
  "personal-data": "Personal data",
  "personal-data-work": "Work",
  wallet: "Wallet",
};

function wireFieldType(field: KeyFormEditorField): string {
  if (field.type === "multiline-text") {
    return "note";
  }
  if (field.type === "recovery-codes") {
    return "recovery-codes";
  }
  return field.type;
}

function fieldValueFromForm(field: KeyFormEditorField): ItemFieldV2["value"] {
  const raw = typeof field.value === "string" ? field.value : "";

  switch (field.type) {
    case "password":
      return { kind: "password", password: raw };
    case "secret":
      return {
        kind: "unknown",
        declaredType: "secret",
        raw: serializeKeyFieldSecretRaw(field.secretKind ?? "password", raw),
      };
    case "url":
      return { kind: "url", url: raw };
    case "totp":
      return { kind: "totp", secretBase32: raw, periodSeconds: 30, digits: 6 };
    case "multiline-text":
      return { kind: "note", note: raw };
    case "file": {
      const parsed = parseKeyFieldFileValue(raw);
      if (parsed) {
        return {
          kind: "file",
          attachmentId: parsed.attachmentId,
          name: parsed.name,
          mimeType: parsed.mimeType,
          sizeBytes: parsed.sizeBytes,
          url: parsed.url,
        };
      }
      return { kind: "file", name: raw };
    }
    case "recovery-codes":
      return { kind: "unknown", declaredType: "recovery-codes", raw };
    case "text":
    case "email":
    case "phone":
    case "date":
    case "card":
    case "card-expiry":
      return { kind: "text", text: raw };
    case "pin":
      return {
        kind: "unknown",
        declaredType: "secret",
        raw: serializeKeyFieldSecretRaw("password", raw),
      };
    case "select":
      return serializeSelectFieldValue(field);
    default:
      return { kind: "unknown", declaredType: field.type, raw };
  }
}

export function keyFormSectionsToItemPlaintext(input: {
  sections: readonly KeyFormEditorSection[];
  itemId: EntityId;
  vaultId: EntityId;
  title: string;
  categoryId: string;
  nowMs?: number;
  tags?: readonly string[];
}): ItemPlaintextV2 {
  const now = input.nowMs ?? Date.now();
  const sections: ItemSectionV2[] = [];
  const fields: ItemFieldV2[] = [];
  const sectionsToSave = sectionsForItemPlaintext(input.sections);

  sectionsToSave.forEach((section, sectionIndex) => {
    sections.push({
      id: section.id,
      title: section.title?.trim() || DEFAULT_SECTION_TITLES[section.id] || section.id,
      order: sectionIndex,
      isPreset: section.variant === "primary",
    });

    section.fields.forEach((field, fieldIndex) => {
      fields.push({
        id: field.id,
        type: wireFieldType(field),
        sectionId: section.id,
        order: fieldIndex,
        label: field.label,
        value: fieldValueFromForm(field),
      });
    });
  });

  return {
    schemaVersion: ITEM_PLAINTEXT_SCHEMA_VERSION_V2,
    itemId: input.itemId,
    vaultId: input.vaultId,
    title: input.title,
    categoryId: input.categoryId,
    createdAtMs: now,
    updatedAtMs: now,
    sections,
    fields,
    ...(input.tags && input.tags.length > 0 ? { tags: [...input.tags] } : {}),
  };
}
