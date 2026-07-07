import { describe, expect, it } from "vitest";

import {
  detectCardBrand,
  formatCardNumber,
  formatCardNumberInput,
  normalizeCardNumber,
} from "./key-field-card.js";
import {
  formatCardExpiry,
  isCardExpiryExpired,
  isInvalidCardExpiryFieldValue,
  normalizeCardExpiry,
} from "./key-field-card-expiry.js";
import { formatPinInput, normalizePinValue } from "./key-field-pin.js";

describe("key-field-card", () => {
  it("formats card number in groups of four digits", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
  });

  it("detects common card brands by bin prefix", () => {
    expect(detectCardBrand("4111")).toBe("visa");
    expect(detectCardBrand("2200123456789012")).toBe("mir");
    expect(detectCardBrand("5100")).toBe("mastercard");
    expect(detectCardBrand("2221")).toBe("mastercard");
    expect(detectCardBrand("3714")).toBe("amex");
    expect(detectCardBrand("6011")).toBe("discover");
    expect(detectCardBrand("6222")).toBe("unionpay");
    expect(detectCardBrand("3530")).toBe("jcb");
    expect(detectCardBrand("3056")).toBe("diners");
    expect(detectCardBrand("5018")).toBe("maestro");
    expect(detectCardBrand("401178")).toBe("elo");
  });

  it("strips non-digits on input", () => {
    expect(formatCardNumberInput("4111 1111", { previousValue: "", selectionStart: 9 })).toBe("4111 1111");
    expect(normalizeCardNumber("4111-1111")).toBe("41111111");
  });
});

describe("key-field-card-expiry", () => {
  it("formats expiry as MM / YY", () => {
    expect(formatCardExpiry("0128")).toBe("01 / 28");
  });

  it("marks expired dates as invalid", () => {
    expect(isCardExpiryExpired("01 / 20", new Date("2026-01-01"))).toBe(true);
    expect(isInvalidCardExpiryFieldValue("01 / 28", new Date("2026-01-01"))).toBe(false);
  });

  it("normalizes expiry digits", () => {
    expect(normalizeCardExpiry("01 / 28")).toBe("0128");
  });
});

describe("key-field-pin", () => {
  it("limits pin to three digits", () => {
    expect(formatPinInput("1234", { previousValue: "", selectionStart: 4 })).toBe("123");
    expect(normalizePinValue("12a3")).toBe("123");
  });
});
