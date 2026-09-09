import {
  isInvalidCardExpiryFieldValue,
  normalizeCardExpiry,
  normalizeCardNumber,
  normalizePinValue,
} from "@okkey/ui";

import type { KeyFormEditorField } from "../components/key-form/KeyFormEditor";
import { isCreditCardRequiredFieldId } from "../components/items/itemCategoryDefaultSections";

export function isCreditCardRequiredFieldEmpty(field: KeyFormEditorField): boolean {
  if (!isCreditCardRequiredFieldId(field.id) || typeof field.value !== "string") {
    return true;
  }

  if (field.id === "card-number") {
    return normalizeCardNumber(field.value).length === 0;
  }

  if (field.id === "card-pin") {
    return normalizePinValue(field.value).length === 0;
  }

  if (field.id === "card-expiry") {
    return normalizeCardExpiry(field.value).length < 4;
  }

  return field.value.trim().length === 0;
}

export function isInvalidCreditCardRequiredField(field: KeyFormEditorField): boolean {
  if (!field.required || !isCreditCardRequiredFieldId(field.id) || typeof field.value !== "string") {
    return false;
  }

  if (isCreditCardRequiredFieldEmpty(field)) {
    return true;
  }

  if (field.id === "card-expiry") {
    return isInvalidCardExpiryFieldValue(field.value);
  }

  if (field.id === "card-pin") {
    return normalizePinValue(field.value).length !== 3;
  }

  return false;
}
