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

describe("normalizeKeyFieldAddressState (view helper)", () => {
  it("strips trailing область / обл. / обл suffixes", () => {
    expect(normalizeKeyFieldAddressState("Московская область")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Московская обл.")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Московская обл")).toBe("Московская");
    expect(normalizeKeyFieldAddressState("Нижний Новгород обл.")).toBe("Нижний Новгород");
    expect(normalizeKeyFieldAddressState("Московская")).toBe("Московская");
  });

  it("keeps край and other non-oblast markers", () => {
    expect(normalizeKeyFieldAddressState("Краснодарский край")).toBe("Краснодарский край");
  });
});

describe("parse/serialize KeyFieldAddressValue state", () => {
  it("preserves область / обл. in the field value (no strip on parse/serialize)", () => {
    const withOblast = ruAddress({ state: "Московская область" });
    const parsed = parseKeyFieldAddressValue(JSON.stringify(withOblast));
    expect(parsed.state).toBe("Московская область");

    const withObl = ruAddress({ state: "Нижний Новгород обл." });
    const serialized = serializeKeyFieldAddressValue(withObl);
    expect(JSON.parse(serialized).state).toBe("Нижний Новгород обл.");

    const roundTrip = parseKeyFieldAddressValue(serialized);
    expect(roundTrip.state).toBe("Нижний Новгород обл.");
  });
});

describe("formatKeyFieldAddressCopyValue (ru)", () => {
  it("formats one-line address with обл. region suffix", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress(), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
  });

  it("strips trailing область / обл. then adds single обл. (no duplicate)", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская область" }), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Московская обл." }), "ru")).toBe(
      "909123, Россия, Московская обл., г. Москва, ул. Октябрьская, д. 39A, кв. 187",
    );
    expect(
      formatKeyFieldAddressCopyValue(
        ruAddress({
          state: "Нижний Новгород обл.",
          city: "Шахнуья",
          street: "Тургенева",
          house: "40А",
          apartment: "1",
          postalCode: "606910",
        }),
        "ru",
      ),
    ).toBe("606910, Россия, Нижний Новгород обл., г. Шахнуья, ул. Тургенева, д. 40А, кв. 1");
  });

  it("keeps non-область region markers", () => {
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Краснодарский край" }), "ru")).toContain(
      "Краснодарский край",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Краснодарский край" }), "ru")).not.toContain(
      "обл.",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Республика Татарстан" }), "ru")).toContain(
      "респ. Татарстан",
    );
    expect(formatKeyFieldAddressCopyValue(ruAddress({ state: "Республика Татарстан" }), "ru")).not.toContain(
      "обл.",
    );
  });
});
