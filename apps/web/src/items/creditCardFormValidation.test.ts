import { describe, expect, it } from "vitest";

import {
  isCreditCardRequiredFieldEmpty,
  isInvalidCreditCardRequiredField,
} from "./creditCardFormValidation";

describe("creditCardFormValidation", () => {
  it("detects empty required credit card fields", () => {
    expect(
      isCreditCardRequiredFieldEmpty({
        id: "card-number",
        type: "card",
        label: "Number",
        value: "   ",
        required: true,
      }),
    ).toBe(true);

    expect(
      isCreditCardRequiredFieldEmpty({
        id: "card-expiry",
        type: "card-expiry",
        label: "Expiry",
        value: "12 / 3",
        required: true,
      }),
    ).toBe(true);

    expect(
      isCreditCardRequiredFieldEmpty({
        id: "card-pin",
        type: "pin",
        label: "PIN",
        value: "",
        required: true,
      }),
    ).toBe(true);
  });

  it("marks expired expiry as invalid", () => {
    expect(
      isInvalidCreditCardRequiredField({
        id: "card-expiry",
        type: "card-expiry",
        label: "Expiry",
        value: "01 / 20",
        required: true,
      }),
    ).toBe(true);
  });
});
