import { describe, expect, it } from "vitest";

import { createKeyFormEditorMessages } from "../components/key-form/keyFormI18n";
import { getDefaultSectionsForCategory } from "../components/items/itemCategoryDefaultSections";
import { itemPlaintextToKeyFormSections } from "./itemPlaintextToKeyFormSections";
import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext";

const messages = createKeyFormEditorMessages("ru");

describe("itemPlaintextToKeyFormSections api_access", () => {
  it("hides empty optional fields in card view but keeps them in storage", () => {
    const sections = [
      {
        id: "api-access",
        variant: "primary" as const,
        fields: [
          {
            id: "api-name",
            type: "text" as const,
            label: "Name",
            value: "Production API",
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-credentials",
            type: "secret" as const,
            label: "Credentials",
            value: "secret-token",
            secretKind: "single-line" as const,
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-type",
            type: "select" as const,
            label: "Type",
            value: "",
            selectOptions: [{ value: "jwt", label: "JWT" }],
            deletable: true,
            editableLabel: true,
          },
          {
            id: "api-hostname",
            type: "text" as const,
            label: "Hostname",
            value: "",
            deletable: true,
            editableLabel: true,
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "API key",
      categoryId: "api_access",
      nowMs: 1,
    });

    expect(item.fields.map((field) => field.id)).toEqual([
      "api-name",
      "api-credentials",
      "api-type",
      "api-hostname",
    ]);

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    const restoredFieldIds = restoredForCard[0]?.fields.map((field) => field.id) ?? [];

    expect(restoredFieldIds).toEqual(["api-name", "api-credentials"]);
  });

  it("restores empty optional fields for edit when they were saved", () => {
    const sections = [
      {
        id: "api-access",
        variant: "primary" as const,
        fields: [
          {
            id: "api-name",
            type: "text" as const,
            label: "Name",
            value: "Production API",
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-credentials",
            type: "secret" as const,
            label: "Credentials",
            value: "secret-token",
            secretKind: "single-line" as const,
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-hostname",
            type: "text" as const,
            label: "Hostname",
            value: "",
            deletable: true,
            editableLabel: true,
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "API key",
      categoryId: "api_access",
      nowMs: 1,
    });

    expect(item.fields.map((field) => field.id)).toEqual(["api-name", "api-credentials", "api-hostname"]);

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const restoredFieldIds = restoredForEdit[0]?.fields.map((field) => field.id) ?? [];

    expect(restoredFieldIds).toEqual(["api-name", "api-credentials", "api-hostname"]);
  });

  it("restores filled optional preset fields with metadata", () => {
    const sections = [
      {
        id: "api-access",
        variant: "primary" as const,
        fields: [
          {
            id: "api-name",
            type: "text" as const,
            label: "Name",
            value: "Production API",
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-credentials",
            type: "secret" as const,
            label: "Credentials",
            value: "secret-token",
            secretKind: "single-line" as const,
            deletable: false,
            editableLabel: false,
            required: true,
          },
          {
            id: "api-type",
            type: "select" as const,
            label: "Type",
            value: "jwt",
            selectOptions: [{ value: "jwt", label: "JWT" }],
            deletable: true,
            editableLabel: true,
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "API key",
      categoryId: "api_access",
      nowMs: 1,
    });

    const restored = itemPlaintextToKeyFormSections(item, messages);
    const restoredFieldIds = restored[0]?.fields.map((field) => field.id) ?? [];

    expect(restoredFieldIds).toEqual(["api-name", "api-credentials", "api-type"]);
    expect(restored[0]?.fields.find((field) => field.id === "api-type")?.value).toBe("jwt");
    expect(restored[0]?.fields.find((field) => field.id === "api-type")?.selectOptions?.length).toBeGreaterThan(0);
  });

  it("includes prepared optional fields for new api_access defaults", () => {
    const defaults = getDefaultSectionsForCategory("api_access", messages);
    const fieldIds = defaults[0]?.fields.map((field) => field.id) ?? [];

    expect(fieldIds).toEqual([
      "api-name",
      "api-credentials",
      "api-type",
      "api-filename",
      "api-valid-from",
      "api-valid-to",
      "api-hostname",
    ]);
  });
});

describe("itemPlaintextToKeyFormSections database", () => {
  it("hides empty fields in card view but keeps them for edit", () => {
    const sections = [
      {
        id: "database",
        variant: "primary" as const,
        fields: [
          {
            id: "db-type",
            type: "select" as const,
            label: "Type",
            value: "postgresql",
            selectOptions: [{ value: "postgresql", label: "PostgreSQL" }],
            deletable: true,
            editableLabel: true,
          },
          {
            id: "db-server",
            type: "text" as const,
            label: "Server",
            value: "",
            deletable: true,
            editableLabel: true,
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Database",
      categoryId: "database",
      nowMs: 1,
    });

    expect(item.fields.map((field) => field.id)).toEqual(["db-type", "db-server"]);

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual(["db-type"]);

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit[0]?.fields.map((field) => field.id)).toEqual(["db-type", "db-server"]);
    expect(restoredForEdit[0]?.fields.find((field) => field.id === "db-type")?.selectOptions?.length).toBeGreaterThan(0);
  });

  it("includes all preset fields for new database defaults", () => {
    const defaults = getDefaultSectionsForCategory("database", messages);
    const fieldIds = defaults[0]?.fields.map((field) => field.id) ?? [];

    expect(fieldIds).toEqual([
      "db-type",
      "db-server",
      "db-port",
      "db-database",
      "db-username",
      "db-password",
      "db-sid",
      "db-alias",
      "db-connection-params",
    ]);
    expect(defaults[0]?.fields.every((field) => field.deletable && field.editableLabel)).toBe(true);
    expect(defaults[0]?.fields.find((field) => field.id === "db-password")?.secretKind).toBe("password");
  });
});

describe("itemPlaintextToKeyFormSections wifi_router", () => {
  it("includes all preset fields for new wifi-router defaults", () => {
    const defaults = getDefaultSectionsForCategory("wifi_router", messages);
    const fieldIds = defaults[0]?.fields.map((field) => field.id) ?? [];

    expect(fieldIds).toEqual([
      "wifi-station-name",
      "wifi-station-password",
      "wifi-server-ip",
      "wifi-airport-id",
      "wifi-network-name",
      "wifi-network-security",
      "wifi-network-password",
      "wifi-connected-storage-password",
    ]);
    expect(defaults[0]?.fields.every((field) => field.deletable && field.editableLabel)).toBe(true);
    expect(defaults[0]?.fields.find((field) => field.id === "wifi-network-security")?.selectOptions?.length).toBe(7);
    expect(defaults[0]?.fields.find((field) => field.id === "wifi-network-password")?.secretKind).toBe("password");
  });
});

describe("itemPlaintextToKeyFormSections credit_card", () => {
  it("includes all preset fields for new credit card defaults", () => {
    const defaults = getDefaultSectionsForCategory("credit_card", messages);
    const fieldIds = defaults[0]?.fields.map((field) => field.id) ?? [];

    expect(fieldIds).toEqual(["card-number", "card-expiry", "card-pin", "card-holder"]);
    expect(defaults[0]?.fields.every((field) => field.deletable === false && !field.editableLabel)).toBe(true);
    expect(defaults[0]?.fields.find((field) => field.id === "card-number")?.type).toBe("card");
    expect(defaults[0]?.fields.find((field) => field.id === "card-expiry")?.type).toBe("card-expiry");
    expect(defaults[0]?.fields.find((field) => field.id === "card-pin")?.type).toBe("pin");
    expect(defaults[0]?.fields.filter((field) => field.required).map((field) => field.id)).toEqual([
      "card-number",
      "card-expiry",
      "card-pin",
    ]);
  });

  it("hides empty optional card-holder in card view", () => {
    const sections = getDefaultSectionsForCategory("credit_card", messages).map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        value:
          field.id === "card-number"
            ? "4111 1111 1111 1111"
            : field.id === "card-expiry"
              ? "12 / 30"
              : field.id === "card-pin"
                ? "123"
                : "",
      })),
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-card-1",
      vaultId: "vault-1",
      title: "My card",
      categoryId: "credit_card",
      nowMs: 1,
    });

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual([
      "card-number",
      "card-expiry",
      "card-pin",
    ]);

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit[0]?.fields.map((field) => field.id)).toEqual([
      "card-number",
      "card-expiry",
      "card-pin",
      "card-holder",
    ]);
  });
});

describe("itemPlaintextToKeyFormSections all categories", () => {
  it("hides empty fields in card view but keeps them for edit in any section", () => {
    const sections = [
      {
        id: "section-main",
        variant: "primary" as const,
        fields: [
          {
            id: "field-filled",
            type: "text" as const,
            label: "Title",
            value: "My note",
            deletable: true,
            editableLabel: true,
          },
          {
            id: "field-empty",
            type: "text" as const,
            label: "Subtitle",
            value: "",
            deletable: true,
            editableLabel: true,
          },
        ],
      },
      {
        id: "section-notes",
        variant: "additional" as const,
        title: "Notes",
        fields: [
          {
            id: "field-1",
            type: "text" as const,
            label: "Hint",
            value: "",
            deletable: true,
            editableLabel: true,
          },
          {
            id: "field-2",
            type: "multiline-text" as const,
            label: "Details",
            value: "Saved note",
            deletable: true,
            editableLabel: true,
          },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Secure note",
      categoryId: "secure_note",
      nowMs: 1,
    });

    expect(item.fields.map((field) => field.id)).toEqual(["field-filled", "field-empty", "field-1", "field-2"]);

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    expect(restoredForCard.flatMap((section) => section.fields.map((field) => field.id))).toEqual([
      "field-filled",
      "field-2",
    ]);

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit.flatMap((section) => section.fields.map((field) => field.id))).toEqual([
      "field-filled",
      "field-empty",
      "field-1",
      "field-2",
    ]);
  });

  it("hides empty preset sections in card view", () => {
    const sections = getDefaultSectionsForCategory("bank_account", messages).map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === "bank-name"
          ? { ...field, value: "Example Bank" }
          : { ...field, value: "" },
      ),
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-bank-1",
      vaultId: "vault-1",
      title: "Main account",
      categoryId: "bank_account",
      nowMs: 1,
    });

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);

    expect(restoredForCard.map((section) => section.id)).toEqual(["bank-account"]);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual(["bank-name"]);
  });

  it("hides empty additional preset sections in card view", () => {
    const sections = getDefaultSectionsForCategory("server", messages).map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === "server-url"
          ? { ...field, value: "server.example.com" }
          : { ...field, value: "" },
      ),
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-server-1",
      vaultId: "vault-1",
      title: "Prod server",
      categoryId: "server",
      nowMs: 1,
    });

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);

    expect(restoredForCard.map((section) => section.id)).toEqual(["server"]);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual(["server-url"]);
  });

  it("preserves custom field order in preset sections", () => {
    const sections = [
      {
        id: "bank-account",
        variant: "primary" as const,
        fields: [
          { id: "bank-iban", type: "text" as const, label: "IBAN", value: "DE00", deletable: true, editableLabel: true },
          { id: "bank-name", type: "text" as const, label: "Bank", value: "Example Bank", deletable: true, editableLabel: true },
          { id: "custom-note", type: "text" as const, label: "Note", value: "VIP", deletable: true, editableLabel: true },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-bank-order-1",
      vaultId: "vault-1",
      title: "Main account",
      categoryId: "bank_account",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit[0]?.fields.map((field) => field.id)).toEqual(["bank-iban", "bank-name", "custom-note"]);

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual(["bank-iban", "bank-name", "custom-note"]);
  });

  it("preserves custom section order in preset categories", () => {
    const sections = [
      {
        id: "server",
        variant: "primary" as const,
        fields: [
          { id: "server-url", type: "text" as const, label: "URL", value: "server.example.com", deletable: true, editableLabel: true },
        ],
      },
      {
        id: "section-custom",
        variant: "additional" as const,
        title: "Custom",
        fields: [
          { id: "custom-field", type: "text" as const, label: "Custom", value: "value", deletable: true, editableLabel: true },
        ],
      },
      {
        id: "admin-console",
        variant: "additional" as const,
        title: "Admin console",
        fields: [
          { id: "admin-console-url", type: "text" as const, label: "Console URL", value: "admin.example.com", deletable: true, editableLabel: true },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-server-order-1",
      vaultId: "vault-1",
      title: "Prod server",
      categoryId: "server",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit.map((section) => section.id)).toEqual(["server", "section-custom", "admin-console"]);
  });

  it("preserves custom field order for unconfigured categories", () => {
    const sections = [
      {
        id: "section-main",
        variant: "primary" as const,
        fields: [
          { id: "field-b", type: "text" as const, label: "B", value: "beta", deletable: true, editableLabel: true },
          { id: "field-a", type: "text" as const, label: "A", value: "alpha", deletable: true, editableLabel: true },
        ],
      },
    ];

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-note-order-1",
      vaultId: "vault-1",
      title: "Secure note",
      categoryId: "secure_note",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit[0]?.fields.map((field) => field.id)).toEqual(["field-b", "field-a"]);
  });
});
