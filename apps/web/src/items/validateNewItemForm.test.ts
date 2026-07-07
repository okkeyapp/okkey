import { describe, expect, it } from "vitest";

import { isConfiguredNewItemForm, validateNewItemForm } from "./validateNewItemForm";

describe("validateNewItemForm unconfigured", () => {
  const baseInput = {
    recordName: "My note",
    vaultId: "vault-1",
    categoryId: "secure_note" as const,
  };

  it("requires at least one filled field when the form has no required fields", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "section-1",
          fields: [{ id: "field-1", type: "text", label: "Note", value: "" }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ kind: "anyField" }]);
  });

  it("passes when name and at least one field are filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "section-1",
          fields: [{ id: "field-1", type: "text", label: "Note", value: "Secret text" }],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("treats categories without required fields as unconfigured", () => {
    expect(
      isConfiguredNewItemForm("secure_note", [
        { id: "section-1", fields: [{ id: "field-1", type: "text", label: "Note", value: "" }] },
      ]),
    ).toBe(false);
  });
});

describe("validateNewItemForm database", () => {
  const baseInput = {
    recordName: "Prod DB",
    vaultId: "vault-1",
    categoryId: "database" as const,
  };

  it("requires at least one filled field in the database section", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "database",
          variant: "primary" as const,
          fields: [
            { id: "db-server", type: "text", label: "Server", value: "" },
            { id: "db-port", type: "text", label: "Port", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "db-server", sectionId: "database" },
      { kind: "field", fieldId: "db-port", sectionId: "database" },
    ]);
  });

  it("passes when at least one database field is filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "database",
          variant: "primary" as const,
          fields: [
            { id: "db-server", type: "text", label: "Server", value: "db.example.com" },
            { id: "db-port", type: "text", label: "Port", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});
