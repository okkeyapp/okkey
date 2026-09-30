import type { ItemFieldV2 } from "@okkey/types";
import {
  coerceRecoveryCodesRawToFormValue,
  coerceSecretRawToFormValue,
  parseKeyFieldAddressValue,
  parseKeyFieldFileValue,
  parseKeyFieldRecoveryCodesValue,
} from "@okkey/ui";

import type { KeyFormEditorField, KeyFormEditorSection } from "../key-form/KeyFormEditor.js";
import { selectFieldValueFromRaw } from "./keyFormSelectField.js";

function hasRecoveryCodesContent(value: string): boolean {
  return parseKeyFieldRecoveryCodesValue(value).some((entry) => entry.code.trim().length > 0);
}

function hasAddressContent(value: string): boolean {
  const address = parseKeyFieldAddressValue(value);
  return [address.street, address.city, address.state, address.postalCode, address.country].some(
    (part) => part.trim().length > 0,
  );
}

export function isKeyFormFieldFilled(field: KeyFormEditorField): boolean {
  if (typeof field.value !== "string") {
    return false;
  }

  const raw = field.value;

  switch (field.type) {
    case "file":
      return parseKeyFieldFileValue(raw) !== null;
    case "recovery-codes":
      return hasRecoveryCodesContent(raw);
    case "address":
      return hasAddressContent(raw);
    default:
      return raw.trim().length > 0;
  }
}

export function isItemFieldFilled(field: ItemFieldV2): boolean {
  switch (field.value.kind) {
    case "text":
      return field.value.text.trim().length > 0;
    case "password":
      return field.value.password.trim().length > 0;
    case "url":
      return field.value.url.trim().length > 0;
    case "totp":
      return field.value.secretBase32.trim().length > 0;
    case "note":
      return field.value.note.trim().length > 0;
    case "file":
      return Boolean(field.value.attachmentId?.trim());
    case "unknown":
      if (field.value.declaredType === "recovery-codes") {
        return hasRecoveryCodesContent(coerceRecoveryCodesRawToFormValue(field.value.raw));
      }
      if (field.value.declaredType === "secret") {
        return coerceSecretRawToFormValue(field.value.raw).trim().length > 0;
      }
      if (field.value.declaredType === "address" && typeof field.value.raw === "string") {
        return hasAddressContent(field.value.raw);
      }
      if (field.value.declaredType === "select") {
        return selectFieldValueFromRaw(field.value.raw).trim().length > 0;
      }
      return false;
    default:
      return false;
  }
}

export function filterFilledKeyFormSections(
  sections: readonly KeyFormEditorSection[],
): KeyFormEditorSection[] {
  return sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(isKeyFormFieldFilled),
    }))
    .filter((section) => section.fields.length > 0);
}
