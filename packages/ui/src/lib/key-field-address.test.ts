import { describe, expect, it } from "vitest";

import { formatKeyFieldAddressCopyValue, type KeyFieldAddressValue } from "./key-field-address.js";

const ruAddress = (overrides: Partial<KeyFieldAddressValue> = {}): KeyFieldAddressValue => ({
  apartment: "187",
  house: "39A",
  street: "Октябрьская",
  city: "Москва",
  state: "Московская",
  postalCode: "909123",
  country: "RU",
  ...overrides,
});

describe("formatKeyFieldAddressCopyValue (ru)", () => {
  it("formats one-line address without обл. region suffix", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress(), "ru")).toBe(
      "909123, Россия, Московская, г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
  });

  it("strips область / обл. from state when already present", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская область" }), "ru")).toBe(
      "909123, Россия, Московская, г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская обл." }), "ru")).toBe(
      "909123, Россия, Московская, г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
  });

  it("keeps non-область region markers", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Краснодарский край" }), "ru")).toContain(
      "Краснодарский край",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Республика Татарстан" }), "ru")).toContain(
      "респ. Татарстан",
    );
  });
});
