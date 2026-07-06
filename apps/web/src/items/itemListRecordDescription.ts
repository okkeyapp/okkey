import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { formatKeyFieldAddressCopyValue, parseKeyFieldAddressValue } from "@okkey/ui";

import { isItemFieldFilled } from "./keyFormFilledFields";
import { parseSelectFieldValueFromItem } from "./keyFormSelectField";

function isSecretItemField(field: ItemFieldV2): boolean {
  if (field.type === "password" || field.type === "totp" || field.type === "recovery-codes") {
    return true;
  }

  return field.value.kind === "unknown" && field.value.declaredType === "secret";
}

function selectFieldDisplayValue(field: ItemFieldV2): string {
  const parsed = parseSelectFieldValueFromItem(field);
  const value = parsed.value.trim();
  if (!value) {
    return "";
  }

  const label = parsed.selectOptions?.find((option) => option.value === value)?.label?.trim();
  return label || value;
}

function itemFieldDisplayValue(field: ItemFieldV2): string {
  switch (field.value.kind) {
    case "text":
      return field.value.text.trim();
    case "url":
      return field.value.url.trim();
    case "note": {
      const firstLine = field.value.note.trim().split("\n")[0]?.trim() ?? "";
      return firstLine;
    }
    case "file":
      return field.value.name?.trim() ?? "";
    case "unknown":
      if (field.value.declaredType === "select") {
        return selectFieldDisplayValue(field);
      }
      if (field.value.declaredType === "address" && typeof field.value.raw === "string") {
        return formatKeyFieldAddressCopyValue(parseKeyFieldAddressValue(field.value.raw));
      }
      return "";
    default:
      return "";
  }
}

function orderedItemFields(item: ItemPlaintextV2): ItemFieldV2[] {
  const fieldsBySection = new Map<string, ItemFieldV2[]>();
  for (const field of item.fields) {
    const bucket = fieldsBySection.get(field.sectionId) ?? [];
    bucket.push(field);
    fieldsBySection.set(field.sectionId, bucket);
  }

  const ordered: ItemFieldV2[] = [];
  const seenFieldIds = new Set<string>();
  const sectionIds = [...item.sections].sort((left, right) => left.order - right.order).map((section) => section.id);

  for (const sectionId of sectionIds) {
    const sectionFields = (fieldsBySection.get(sectionId) ?? []).sort((left, right) => left.order - right.order);
    for (const field of sectionFields) {
      ordered.push(field);
      seenFieldIds.add(field.id);
    }
  }

  const orphanFields = item.fields
    .filter((field) => !seenFieldIds.has(field.id))
    .sort((left, right) => left.order - right.order);

  return [...ordered, ...orphanFields];
}

export function readFirstNonSecretFilledFieldDescription(item: ItemPlaintextV2): string {
  for (const field of orderedItemFields(item)) {
    if (!isItemFieldFilled(field) || isSecretItemField(field)) {
      continue;
    }

    const displayValue = itemFieldDisplayValue(field);
    if (displayValue.length > 0) {
      return displayValue;
    }
  }

  return "";
}
