import type { KeyFieldValueTransformContext } from "./key-field-value-transform.js";

export const KEY_FIELD_PIN_MAX_LENGTH = 3;

export function normalizePinValue(value: string): string {
  return value.replace(/\D/g, "").slice(0, KEY_FIELD_PIN_MAX_LENGTH);
}

export function formatPinInput(value: string, _context: KeyFieldValueTransformContext): string {
  return normalizePinValue(value);
}

export function concealedPinValue(_length: number): string {
  return "•••";
}
