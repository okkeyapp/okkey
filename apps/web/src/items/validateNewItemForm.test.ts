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

describe("validateNewItemForm credit_card", () => {
  const baseInput = {
    recordName: "My card",
    vaultId: "vault-1",
    categoryId: "credit_card" as const,
  };

  const creditCardSections = [
    {
      id: "credit-card",
      variant: "primary" as const,
      fields: [
        { id: "card-number", type: "card", label: "Number", value: "", required: true },
        { id: "card-expiry", type: "card-expiry", label: "Expiry", value: "", required: true },
        { id: "card-pin", type: "pin", label: "PIN", value: "", required: true },
        { id: "card-holder", type: "text", label: "Holder", value: "" },
      ],
    },
  ];

  it("requires card number, expiry and pin", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: creditCardSections,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "card-number", sectionId: "credit-card" },
      { kind: "field", fieldId: "card-expiry", sectionId: "credit-card" },
      { kind: "field", fieldId: "card-pin", sectionId: "credit-card" },
    ]);
  });

  it("passes when required credit card fields are filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          ...creditCardSections[0],
          fields: [
            { id: "card-number", type: "card", label: "Number", value: "4111 1111 1111 1111", required: true },
            { id: "card-expiry", type: "card-expiry", label: "Expiry", value: "12 / 30", required: true },
            { id: "card-pin", type: "pin", label: "PIN", value: "123", required: true },
            { id: "card-holder", type: "text", label: "Holder", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("treats incomplete expiry as empty", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          ...creditCardSections[0],
          fields: [
            { id: "card-number", type: "card", label: "Number", value: "4111 1111 1111 1111", required: true },
            { id: "card-expiry", type: "card-expiry", label: "Expiry", value: "12 / 3", required: true },
            { id: "card-pin", type: "pin", label: "PIN", value: "123", required: true },
            { id: "card-holder", type: "text", label: "Holder", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ kind: "field", fieldId: "card-expiry", sectionId: "credit-card" }]);
  });
});

describe("validateNewItemForm bank_account", () => {
  const baseInput = {
    recordName: "Main account",
    vaultId: "vault-1",
    categoryId: "bank_account" as const,
  };

  it("requires at least one filled field in the bank account section", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "bank-account",
          variant: "primary" as const,
          fields: [
            { id: "bank-name", type: "text", label: "Bank", value: "" },
            { id: "bank-iban", type: "text", label: "IBAN", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "bank-name", sectionId: "bank-account" },
      { kind: "field", fieldId: "bank-iban", sectionId: "bank-account" },
    ]);
  });

  it("passes when at least one bank account field is filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "bank-account",
          variant: "primary" as const,
          fields: [
            { id: "bank-name", type: "text", label: "Bank", value: "Example Bank" },
            { id: "bank-iban", type: "text", label: "IBAN", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("does not require bank details section fields", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "bank-account",
          variant: "primary" as const,
          fields: [{ id: "bank-name", type: "text", label: "Bank", value: "Example Bank" }],
        },
        {
          id: "bank-details",
          variant: "additional" as const,
          title: "Bank details",
          fields: [
            { id: "bank-address", type: "text", label: "Address", value: "" },
            { id: "bank-phone", type: "phone", label: "Phone", value: "" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

describe("validateNewItemForm crypto_wallet", () => {
  const baseInput = {
    recordName: "Main wallet",
    vaultId: "vault-1",
    categoryId: "crypto_wallet" as const,
  };

  it("requires at least one filled field in the crypto wallet section", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "crypto-wallet",
          variant: "primary" as const,
          fields: [
            { id: "crypto-access-pin", type: "secret", label: "PIN", value: "", secretKind: "single-line" },
            { id: "crypto-passphrase", type: "secret", label: "Passphrase", value: "", secretKind: "single-line" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { kind: "field", fieldId: "crypto-access-pin", sectionId: "crypto-wallet" },
      { kind: "field", fieldId: "crypto-passphrase", sectionId: "crypto-wallet" },
    ]);
  });

  it("passes when at least one crypto wallet field is filled", () => {
    const result = validateNewItemForm({
      ...baseInput,
      sections: [
        {
          id: "crypto-wallet",
          variant: "primary" as const,
          fields: [
            { id: "crypto-access-pin", type: "secret", label: "PIN", value: "1234", secretKind: "single-line" },
            { id: "crypto-passphrase", type: "secret", label: "Passphrase", value: "", secretKind: "single-line" },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});
