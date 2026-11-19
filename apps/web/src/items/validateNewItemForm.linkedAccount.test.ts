import { describe, expect, it } from "vitest";

import { isConfiguredNewItemForm, validateNewItemForm } from "./validateNewItemForm";

const loginSections = [
  {
    id: "credentials",
    variant: "primary" as const,
    fields: [
      { id: "login", type: "text" as const, label: "login", value: "", required: true },
      {
        id: "password",
        type: "password" as const,
        label: "password",
        value: "",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "websites",
    variant: "primary" as const,
    fields: [
      {
        id: "website-1",
        type: "url" as const,
        label: "website URL",
        value: "https://app.example.com",
        required: true,
        urlAutofillScope: "entire-site" as const,
      },
    ],
  },
];

describe("validateNewItemForm linkedAccountItemId", () => {
  it("allows relation-only logins when a linked account is set", () => {
    const result = validateNewItemForm({
      recordName: "App",
      vaultId: "vault-1",
      categoryId: "login",
      sections: loginSections,
      linkedAccountItemId: "login-sso",
    });
    expect(result.ok).toBe(true);
  });

  it("still requires username and password without a linked account", () => {
    const result = validateNewItemForm({
      recordName: "App",
      vaultId: "vault-1",
      categoryId: "login",
      sections: loginSections,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { kind: "field", fieldId: "login", sectionId: "credentials" },
        { kind: "field", fieldId: "password", sectionId: "credentials" },
      ]),
    );
  });

  it("treats a linked account as a configured login form", () => {
    expect(
      isConfiguredNewItemForm("login", [{ id: "credentials", variant: "primary", fields: [] }], {
        linkedAccountItemId: "login-sso",
      }),
    ).toBe(true);
  });
});
