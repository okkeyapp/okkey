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
        id: "secure-note",
        variant: "primary" as const,
        fields: [
          {
            id: "note",
            type: "multiline-text" as const,
            label: "заметка",
            value: "",
            deletable: true,
            editableLabel: true,
          },
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

    expect(item.fields.map((field) => field.id)).toEqual(["note", "field-filled", "field-empty", "field-1", "field-2"]);

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);
    expect(restoredForCard.flatMap((section) => section.fields.map((field) => field.id))).toEqual([
      "field-filled",
      "field-2",
    ]);

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit.flatMap((section) => section.fields.map((field) => field.id))).toEqual([
      "note",
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

  it("does not show default Additional title for unnamed import sections", () => {
    const restored = itemPlaintextToKeyFormSections(
      {
        schemaVersion: 2,
        itemId: "item-note-1",
        vaultId: "vault-1",
        title: "Backup codes",
        categoryId: "secure_note",
        createdAtMs: 1,
        updatedAtMs: 1,
        sections: [
          { id: "secure-note", title: "Note", order: 0, isPreset: true },
          { id: "additional", title: "Additional", order: 1, isPreset: false },
        ],
        fields: [
          {
            id: "note",
            type: "note",
            sectionId: "secure-note",
            order: 0,
            label: "Note",
            value: { kind: "note", note: "" },
          },
          {
            id: "notes-extra",
            type: "note",
            sectionId: "additional",
            order: 0,
            label: "Notes",
            value: { kind: "note", note: "001400\n730656" },
          },
        ],
      },
      messages,
    );

    const additional = restored.find((section) => section.id === "additional");
    expect(additional?.title).toBeUndefined();
    expect(additional?.fields[0]?.value).toContain("001400");
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

  it("preserves custom field order for secure note", () => {
    const sections = [
      {
        id: "secure-note",
        variant: "primary" as const,
        fields: [
          { id: "field-b", type: "text" as const, label: "B", value: "beta", deletable: true, editableLabel: true },
          { id: "field-a", type: "text" as const, label: "A", value: "alpha", deletable: true, editableLabel: true },
          { id: "note", type: "multiline-text" as const, label: "заметка", value: "body", deletable: true, editableLabel: true },
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
    expect(restoredForEdit[0]?.fields.map((field) => field.id)).toEqual(["field-b", "field-a", "note"]);
  });

  it("hides empty wallet section in card view for crypto wallet", () => {
    const sections = getDefaultSectionsForCategory("crypto_wallet", messages).map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === "crypto-access-pin"
          ? { ...field, value: "1234" }
          : { ...field, value: "" },
      ),
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-crypto-1",
      vaultId: "vault-1",
      title: "BTC wallet",
      categoryId: "crypto_wallet",
      nowMs: 1,
    });

    const restoredForCard = itemPlaintextToKeyFormSections(item, messages);

    expect(restoredForCard.map((section) => section.id)).toEqual(["crypto-wallet"]);
    expect(restoredForCard[0]?.fields.map((field) => field.id)).toEqual(["crypto-access-pin"]);
    expect(restoredForCard[0]?.fields[0]?.secretKind).toBe("single-line");
  });
});

describe("itemPlaintextToKeyFormSections personal_data", () => {
  it("includes locked primary presets and editable work section defaults", () => {
    const defaults = getDefaultSectionsForCategory("personal_data", messages);

    expect(defaults).toHaveLength(2);
    expect(defaults[0]?.id).toBe("personal-data");
    expect(defaults[0]?.fields.map((field) => field.id)).toEqual([
      "first-name",
      "last-name",
      "middle-name",
      "initials",
      "gender",
      "birth-date",
      "phone",
      "email",
      "address",
    ]);
    expect(defaults[0]?.fields.every((field) => field.deletable === false && field.editableLabel === false)).toBe(true);
    expect(defaults[0]?.fields.find((field) => field.id === "gender")?.selectOptions).toEqual([
      { value: "male", label: "Мужской" },
      { value: "female", label: "Женский" },
    ]);

    expect(defaults[1]?.id).toBe("personal-data-work");
    expect(defaults[1]?.title).toBe("Работа");
    expect(defaults[1]?.fields.map((field) => field.id)).toEqual([
      "work-company",
      "work-department",
      "work-position",
      "work-phone",
      "work-email",
    ]);
    expect(defaults[1]?.fields.every((field) => field.deletable && field.editableLabel)).toBe(true);
  });

  it("round-trips custom primary fields and preserves locked preset metadata", () => {
    const sections = getDefaultSectionsForCategory("personal_data", messages).map((section) => {
      if (section.id !== "personal-data") {
        return section;
      }

      return {
        ...section,
        fields: [
          ...section.fields.map((field) =>
            field.id === "first-name" ? { ...field, value: "Ivan" } : field,
          ),
          {
            id: "custom-note",
            type: "text" as const,
            label: "Note",
            value: "VIP",
            editableLabel: true,
            deletable: true,
          },
        ],
      };
    });

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-personal-1",
      vaultId: "vault-1",
      title: "John Doe",
      categoryId: "personal_data",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const primary = restoredForEdit.find((section) => section.id === "personal-data");

    expect(primary?.fields.map((field) => field.id)).toEqual([
      "first-name",
      "last-name",
      "middle-name",
      "initials",
      "gender",
      "birth-date",
      "phone",
      "email",
      "address",
      "custom-note",
    ]);
    expect(primary?.fields.find((field) => field.id === "first-name")).toMatchObject({
      value: "Ivan",
      deletable: false,
      editableLabel: false,
    });
    expect(primary?.fields.find((field) => field.id === "custom-note")).toMatchObject({
      value: "VIP",
      deletable: true,
      editableLabel: true,
    });
  });
});

describe("itemPlaintextToKeyFormSections passport", () => {
  it("includes locked primary presets with gender options", () => {
    const defaults = getDefaultSectionsForCategory("passport", messages);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe("passport");
    expect(defaults[0]?.fields.map((field) => field.id)).toEqual([
      "passport-type",
      "issuing-country",
      "passport-number",
      "full-name",
      "gender",
      "nationality",
      "issuing-authority",
      "birth-date",
      "birth-place",
      "issue-date",
      "expiry-date",
    ]);
    expect(defaults[0]?.fields.every((field) => field.deletable === false && field.editableLabel === false)).toBe(true);
    expect(defaults[0]?.fields.find((field) => field.id === "gender")?.selectOptions).toEqual([
      { value: "male", label: "Мужской" },
      { value: "female", label: "Женский" },
    ]);
    expect(defaults[0]?.fields.find((field) => field.id === "passport-number")?.label).toBe("серия номер");
  });

  it("round-trips custom fields and preserves locked preset metadata", () => {
    const sections = getDefaultSectionsForCategory("passport", messages).map((section) => ({
      ...section,
      fields: [
        ...section.fields.map((field) =>
          field.id === "full-name" ? { ...field, value: "Ivan Petrov" } : field,
        ),
        {
          id: "custom-note",
          type: "text" as const,
          label: "Note",
          value: "VIP",
          editableLabel: true,
          deletable: true,
        },
      ],
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-passport-1",
      vaultId: "vault-1",
      title: "Passport",
      categoryId: "passport",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const primary = restoredForEdit.find((section) => section.id === "passport");

    expect(primary?.fields.map((field) => field.id)).toEqual([
      "passport-type",
      "issuing-country",
      "passport-number",
      "full-name",
      "gender",
      "nationality",
      "issuing-authority",
      "birth-date",
      "birth-place",
      "issue-date",
      "expiry-date",
      "custom-note",
    ]);
    expect(primary?.fields.find((field) => field.id === "full-name")).toMatchObject({
      value: "Ivan Petrov",
      deletable: false,
      editableLabel: false,
    });
    expect(primary?.fields.find((field) => field.id === "custom-note")).toMatchObject({
      value: "VIP",
      deletable: true,
      editableLabel: true,
    });
  });
});

describe("itemPlaintextToKeyFormSections secure_note", () => {
  it("includes note preset with editable label", () => {
    const defaults = getDefaultSectionsForCategory("secure_note", messages);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe("secure-note");
    expect(defaults[0]?.fields.map((field) => field.id)).toEqual(["note"]);
    expect(defaults[0]?.fields[0]).toMatchObject({
      type: "multiline-text",
      label: "заметка",
      deletable: false,
      editableLabel: true,
    });
  });

  it("round-trips custom fields and preserves note preset metadata", () => {
    const sections = getDefaultSectionsForCategory("secure_note", messages).map((section) => ({
      ...section,
      fields: [
        ...section.fields.map((field) =>
          field.id === "note" ? { ...field, value: "Saved note" } : field,
        ),
        {
          id: "custom-hint",
          type: "text" as const,
          label: "Hint",
          value: "VIP",
          editableLabel: true,
          deletable: true,
        },
      ],
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-secure-note-1",
      vaultId: "vault-1",
      title: "Secure note",
      categoryId: "secure_note",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const primary = restoredForEdit.find((section) => section.id === "secure-note");

    expect(primary?.fields.map((field) => field.id)).toEqual(["note", "custom-hint"]);
    expect(primary?.fields.find((field) => field.id === "note")).toMatchObject({
      type: "multiline-text",
      value: "Saved note",
      deletable: true,
      editableLabel: true,
    });
    expect(primary?.fields.find((field) => field.id === "custom-hint")).toMatchObject({
      value: "VIP",
      deletable: true,
      editableLabel: true,
    });
  });

  it("round-trips multiline click-to-copy preference", () => {
    const sections = getDefaultSectionsForCategory("secure_note", messages).map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === "note" ? { ...field, value: "Secret note", disableClickCopy: true } : field,
      ),
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-secure-note-copy-1",
      vaultId: "vault-1",
      title: "Secure note",
      categoryId: "secure_note",
      nowMs: 1,
    });

    const noteField = item.fields.find((field) => field.id === "note");
    expect(noteField?.value.kind).toBe("note");
    if (noteField?.value.kind === "note") {
      expect(noteField.value.disableClickCopy).toBe(true);
    }

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    expect(restoredForEdit[0]?.fields.find((field) => field.id === "note")).toMatchObject({
      type: "multiline-text",
      value: "Secret note",
      disableClickCopy: true,
    });
  });

  it("normalizes legacy migrated note ids", () => {
    const item = keyFormSectionsToItemPlaintext({
      sections: [
        {
          id: "s-note-body",
          variant: "primary" as const,
          fields: [{ id: "f-note-body", type: "multiline-text" as const, label: "Notes", value: "Legacy note" }],
        },
      ],
      itemId: "item-legacy-note-1",
      vaultId: "vault-1",
      title: "Legacy note",
      categoryId: "secure_note",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const primary = restoredForEdit.find((section) => section.id === "secure-note");

    expect(primary?.fields.map((field) => field.id)).toEqual(["note"]);
    expect(primary?.fields[0]).toMatchObject({
      type: "multiline-text",
      value: "Legacy note",
      editableLabel: true,
    });
  });
});

describe("itemPlaintextToKeyFormSections secure_files", () => {
  it("includes locked file preset with editable label", () => {
    const defaults = getDefaultSectionsForCategory("secure_files", messages);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe("secure-files");
    expect(defaults[0]?.fields.map((field) => field.id)).toEqual(["secure-file"]);
    expect(defaults[0]?.fields[0]).toMatchObject({
      type: "file",
      label: "файл",
      deletable: false,
      editableLabel: true,
    });
  });

  it("round-trips custom fields and preserves locked file preset metadata", () => {
    const sections = getDefaultSectionsForCategory("secure_files", messages).map((section) => ({
      ...section,
      fields: [
        ...section.fields,
        {
          id: "custom-note",
          type: "text" as const,
          label: "Note",
          value: "Secret",
          editableLabel: true,
          deletable: true,
        },
      ],
    }));

    const item = keyFormSectionsToItemPlaintext({
      sections,
      itemId: "item-secure-files-1",
      vaultId: "vault-1",
      title: "Secure file",
      categoryId: "secure_files",
      nowMs: 1,
    });

    const restoredForEdit = itemPlaintextToKeyFormSections(item, messages, { includeEmptyFields: true });
    const primary = restoredForEdit.find((section) => section.id === "secure-files");

    expect(primary?.fields.map((field) => field.id)).toEqual(["secure-file", "custom-note"]);
    expect(primary?.fields.find((field) => field.id === "secure-file")).toMatchObject({
      type: "file",
      deletable: true,
      editableLabel: true,
    });
    expect(primary?.fields.find((field) => field.id === "custom-note")).toMatchObject({
      value: "Secret",
      deletable: true,
      editableLabel: true,
    });
  });
});
