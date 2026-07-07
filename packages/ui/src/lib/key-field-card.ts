import type { KeyFieldValueTransformContext } from "./key-field-value-transform.js";

export type CardBrand =
  | "visa"
  | "mastercard"
  | "mir"
  | "amex"
  | "discover"
  | "unionpay"
  | "jcb"
  | "diners"
  | "maestro"
  | "elo"
  | "unknown";

export function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 19);
}

export function formatCardNumber(value: string): string {
  const digits = normalizeCardNumber(value);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function isMastercardBin(digits: string): boolean {
  if (/^5[1-5]/.test(digits)) {
    return true;
  }

  if (digits.length < 4) {
    return false;
  }

  const prefix = Number.parseInt(digits.slice(0, 4), 10);
  return prefix >= 2221 && prefix <= 2720;
}

function isMaestroBin(digits: string): boolean {
  return /^(5018|5020|5038|5893|6304|6759|676[1-3]|50(18|20|38))/.test(digits);
}

function isDinersBin(digits: string): boolean {
  return /^3(?:0[0-5]|09|[68]\d)/.test(digits);
}

function isDiscoverBin(digits: string): boolean {
  return /^6(?:011|4[4-9]|5)/.test(digits);
}

function isEloBin(digits: string): boolean {
  return /^(401178|401179|431274|438935|451416|457393|457631|457632|504175|506699|506770|627780|636297|636368|650031|650032|650033|650035|650051|650405|650439|650485|650486|650487|650488|650489|650490|650491|650492|650493|650494|650495|650496|650497|650498|650499|651652|651653|651654|655000|655001)/.test(
    digits,
  );
}

export function detectCardBrand(value: string): CardBrand {
  const digits = normalizeCardNumber(value);
  if (digits.length === 0) {
    return "unknown";
  }

  if (isEloBin(digits)) {
    return "elo";
  }

  if (/^4/.test(digits)) {
    return "visa";
  }

  if (/^220[0-4]/.test(digits)) {
    return "mir";
  }

  if (isMaestroBin(digits)) {
    return "maestro";
  }

  if (isMastercardBin(digits)) {
    return "mastercard";
  }

  if (/^3[47]/.test(digits)) {
    return "amex";
  }

  if (/^35/.test(digits)) {
    return "jcb";
  }

  if (isDinersBin(digits)) {
    return "diners";
  }

  if (/^62/.test(digits)) {
    return "unionpay";
  }

  if (isDiscoverBin(digits)) {
    return "discover";
  }

  return "unknown";
}

function removeCardDigitAtIndex(value: string, digitIndex: number): string {
  const digits = normalizeCardNumber(value);
  if (digitIndex < 0) {
    return digits;
  }
  return `${digits.slice(0, digitIndex)}${digits.slice(digitIndex + 1)}`;
}

export function formatCardNumberInput(value: string, context: KeyFieldValueTransformContext): string {
  const normalizedValue = normalizeCardNumber(value);
  const previousNormalizedValue = normalizeCardNumber(context.previousValue);
  if (
    context.inputType?.startsWith("delete") &&
    normalizedValue === previousNormalizedValue &&
    value.length < context.previousValue.length
  ) {
    const valueBeforeCursor = value.slice(0, context.selectionStart ?? value.length);
    const digitsBeforeCursor = normalizeCardNumber(valueBeforeCursor).length;
    return formatCardNumber(removeCardDigitAtIndex(context.previousValue, digitsBeforeCursor - 1));
  }

  return formatCardNumber(value);
}
