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

describe("validateNewItemForm server", () => {
  const baseInput = {
    recordName: "Prod server",
    vaultId: "vault-1",
    categoryId: "server" as const,
  };

  it("requires at least one filled field in the server section", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "server",
          variant: "primary" as const,
          fields: [
            { id: "server-url", type: "text", label: "URL", value: "" },
            { id: "server-login", type: "text", label: "Login", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "server-url", sectionId: "server" },
      { kind: "field", fieldId: "server-login", sectionId: "server" },
    ]);
  });

  it("passes when at least one server field is filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "server",
          variant: "primary" as const,
          fields: [
            { id: "server-url", type: "text", label: "URL", value: "server.example.com" },
            { id: "server-login", type: "text", label: "Login", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
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

describe("validateNewItemForm wifi_router", () => {
  const baseInput = {
    recordName: "Home router",
    vaultId: "vault-1",
    categoryId: "wifi_router" as const,
  };

  it("requires at least one filled field in the wifi-router section", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "wifi-router",
          variant: "primary" as const,
          fields: [
            { id: "wifi-network-name", type: "text", label: "Network", value: "" },
            { id: "wifi-network-password", type: "secret", label: "Password", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "wifi-network-name", sectionId: "wifi-router" },
      { kind: "field", fieldId: "wifi-network-password", sectionId: "wifi-router" },
    ]);
  });

  it("passes when at least one wifi-router field is filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "wifi-router",
          variant: "primary" as const,
          fields: [
            { id: "wifi-network-name", type: "text", label: "Network", value: "Home Wi‑Fi" },
            { id: "wifi-network-password", type: "secret", label: "Password", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});
