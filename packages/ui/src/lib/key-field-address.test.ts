import { describe, expect, it } from "vitest";

import {
  formatKeyFieldAddressCopyValue,
  normalizeKeyFieldAddressState,
  parseKeyFieldAddressValue,
  serializeKeyFieldAddressValue,
  type KeyFieldAddressValue,
} from "./key-field-address.js";

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

describe("normalizeKeyFieldAddressState", () => {
  it("strips область / обл. / обл suffixes", () => {
    expect(normalizeKeyFieldAddressState("Московская область")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Московская обл.")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Московская обл")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Московская")).toBe("Московская");
  });

  it("keeps край and other non-oblast markers", () => {
    expect(normalizeKeyFieldAddressState("Краснодарский край")).toBe("Краснодарский край");
  });
});

describe("parse/serialize KeyFieldAddressValue state", () => {
  it("normalizes state on parse (display) and serialize (save)", () => {
    const parsed = parseKeyFieldAddressValue(
      JSON.stringify(ruAddress({ state: "Московская область" })),
    );
    expect(parsed.state).toBe("Московская");

    const serialized = serializeKeyFieldAddressValue(ruAddress({ state: "Московская обл." }));
    expect(JSON.parse(serialized).state).toBe("Московская");
  });
});

describe("formatKeyFieldAddressCopyValue (ru)", () => {
  it("formats one-line address with обл. region suffix", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress(), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
  });

  it("does not duplicate обл. when state already has область / обл.", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская область" }), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская обл." }), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
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
