import type { KeyFieldValueTransformContext } from "./key-field-value-transform.js";

export function normalizeCardExpiry(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function formatCardExpiry(value: string): string {
  const digits = normalizeCardExpiry(value);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function removeExpiryDigitAtIndex(value: string, digitIndex: number): string {
  const digits = normalizeCardExpiry(value);
  if (digitIndex < 0) {
    return digits;
  }
  return `${digits.slice(0, digitIndex)}${digits.slice(digitIndex + 1)}`;
}

export function formatCardExpiryInput(value: string, context: KeyFieldValueTransformContext): string {
  const normalizedValue = normalizeCardExpiry(value);
  const previousNormalizedValue = normalizeCardExpiry(context.previousValue);
  if (
    context.inputType?.startsWith("delete") &&
    normalizedValue === previousNormalizedValue &&
    value.length < context.previousValue.length
  ) {
    const valueBeforeCursor = value.slice(0, context.selectionStart ?? value.length);
    const digitsBeforeCursor = normalizeCardExpiry(valueBeforeCursor).length;
    return formatCardExpiry(removeExpiryDigitAtIndex(context.previousValue, digitsBeforeCursor - 1));
  }

  return formatCardExpiry(value);
}

export function isValidCardExpiryMonth(value: string): boolean {
  const digits = normalizeCardExpiry(value);
  if (digits.length < 2) {
    return true;
  }
  const month = Number.parseInt(digits.slice(0, 2), 10);
  return month >= 1 && month <= 12;
}

export function isCardExpiryExpired(value: string, now = new Date()): boolean {
  const digits = normalizeCardExpiry(value);
  if (digits.length < 4 || !isValidCardExpiryMonth(value)) {
    return false;
  }

  const month = Number.parseInt(digits.slice(0, 2), 10);
  const year = Number.parseInt(digits.slice(2, 4), 10);
  const expiryEnd = new Date(2000 + year, month, 0, 23, 59, 59, 999);
  return expiryEnd.getTime() < now.getTime();
}

export function isInvalidCardExpiryFieldValue(value: string, now = new Date()): boolean {
  const digits = normalizeCardExpiry(value);
  if (digits.length === 0) {
    return false;
  }
  if (digits.length < 4) {
    return false;
  }
  return !isValidCardExpiryMonth(value) || isCardExpiryExpired(value, now);
}
