import { describe, expect, it } from "vitest";

import { isInvalidPersonalDataNameField } from "./personalDataFormValidation";

describe("personalDataFormValidation", () => {
  const section = {
    id: "personal-data",
    variant: "primary" as const,
    fields: [
      { id: "first-name", type: "text", label: "First name", value: "" },
      { id: "last-name", type: "text", label: "Last name", value: "" },
    ],
  };

  it("marks both name fields invalid when neither is filled", () => {
    expect(isInvalidPersonalDataNameField(section, section.fields[0]!)).toBe(true);
    expect(isInvalidPersonalDataNameField(section, section.fields[1]!)).toBe(true);
  });

  it("does not mark name fields invalid when one of them is filled", () => {
    const filledSection = {
      ...section,
      fields: [
        { id: "first-name", type: "text", label: "First name", value: "Ivan" },
        { id: "last-name", type: "text", label: "Last name", value: "" },
      ],
    };

    expect(isInvalidPersonalDataNameField(filledSection, filledSection.fields[0]!)).toBe(false);
    expect(isInvalidPersonalDataNameField(filledSection, filledSection.fields[1]!)).toBe(false);
  });
});
