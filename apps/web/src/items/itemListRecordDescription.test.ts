import { describe, expect, it } from "vitest";

import { itemPlaintextToListRecord } from "./itemPlaintextToListRecord";
import { readFirstNonSecretFilledFieldDescription, readPersonalDataListDescription } from "./itemListRecordDescription";
import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext";

describe("readFirstNonSecretFilledFieldDescription", () => {
  it("returns first filled non-secret field in section order", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Login",
      categoryId: "login",
      nowMs: 1,
      sections: [
        {
          id: "login-password",
          variant: "primary",
          fields: [
            {
              id: "login",
              type: "text",
              label: "Login",
              value: "user@example.com",
              deletable: false,
              editableLabel: false,
              required: true,
            },
            {
              id: "password",
              type: "password",
              label: "Password",
              value: "secret",
              deletable: false,
              editableLabel: false,
              required: true,
            },
          ],
        },
      ],
    });

    expect(readFirstNonSecretFilledFieldDescription(item)).toBe("user@example.com");
  });

  it("skips secret fields and uses next non-secret filled field", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-2",
      vaultId: "vault-1",
      title: "API",
      categoryId: "api_access",
      nowMs: 1,
      sections: [
        {
          id: "api-access",
          variant: "primary",
          fields: [
            {
              id: "api-name",
              type: "text",
              label: "Name",
              value: "Production API",
              deletable: false,
              editableLabel: false,
              required: true,
            },
            {
              id: "api-credentials",
              type: "secret",
              label: "Credentials",
              value: "token",
              secretKind: "single-line",
              deletable: false,
              editableLabel: false,
              required: true,
            },
          ],
        },
      ],
    });

    expect(readFirstNonSecretFilledFieldDescription(item)).toBe("Production API");
  });

  it("returns select option label instead of internal value", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-3",
      vaultId: "vault-1",
      title: "Database",
      categoryId: "database",
      nowMs: 1,
      sections: [
        {
          id: "database",
          variant: "primary",
          fields: [
            {
              id: "db-type",
              type: "select",
              label: "Type",
              value: "mssql",
              selectOptions: [{ value: "mssql", label: "Microsoft SQL Server" }],
              deletable: false,
              editableLabel: false,
              required: false,
            },
            {
              id: "db-server",
              type: "text",
              label: "Server",
              value: "db.example.com",
              deletable: true,
              editableLabel: true,
            },
          ],
        },
      ],
    });

    expect(readFirstNonSecretFilledFieldDescription(item)).toBe("Microsoft SQL Server");
  });

  it("returns date field value stored as text", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-4",
      vaultId: "vault-1",
      title: "Document",
      categoryId: "document",
      nowMs: 1,
      sections: [
        {
          id: "document",
          variant: "primary",
          fields: [
            {
              id: "doc-date",
              type: "date",
              label: "Date",
              value: "2026-07-06",
              deletable: true,
              editableLabel: true,
            },
          ],
        },
      ],
    });

    expect(readFirstNonSecretFilledFieldDescription(item)).toBe("2026-07-06");
  });

  it("returns empty string when only secret fields are filled", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-5",
      vaultId: "vault-1",
      title: "Secure note",
      categoryId: "secure_note",
      nowMs: 1,
      sections: [
        {
          id: "secure-note",
          variant: "primary",
          fields: [
            {
              id: "note",
              type: "secret",
              label: "Note",
              value: "hidden",
              secretKind: "multi-line",
              deletable: false,
              editableLabel: false,
              required: true,
            },
          ],
        },
      ],
    });

    expect(readFirstNonSecretFilledFieldDescription(item)).toBe("");
  });
});

function createPersonalDataItem(fields: Array<{ id: string; value: string }>) {
  return keyFormSectionsToItemPlaintext({
    itemId: "item-personal-list",
    vaultId: "vault-1",
    title: "Personal",
    categoryId: "personal_data",
    nowMs: 1,
    sections: [
      {
        id: "personal-data",
        variant: "primary",
        fields: fields.map((field) => ({
          id: field.id,
          type: "text" as const,
          label: field.id,
          value: field.value,
          deletable: false,
          editableLabel: false,
        })),
      },
    ],
  });
}

describe("readPersonalDataListDescription", () => {
  it("returns first and last name when both are filled", () => {
    const item = createPersonalDataItem([
      { id: "first-name", value: "Иван" },
      { id: "last-name", value: "Петров" },
    ]);

    expect(readPersonalDataListDescription(item)).toBe("Иван Петров");
  });

  it("returns first and middle name when last name is empty", () => {
    const item = createPersonalDataItem([
      { id: "first-name", value: "Иван" },
      { id: "middle-name", value: "Сергеевич" },
    ]);

    expect(readPersonalDataListDescription(item)).toBe("Иван Сергеевич");
  });

  it("returns last name and initials when first name is empty", () => {
    const item = createPersonalDataItem([
      { id: "last-name", value: "Петров" },
      { id: "initials", value: "И.С." },
    ]);

    expect(readPersonalDataListDescription(item)).toBe("Петров И.С.");
  });

  it("prefers first and last name over first and middle name", () => {
    const item = createPersonalDataItem([
      { id: "first-name", value: "Иван" },
      { id: "last-name", value: "Петров" },
      { id: "middle-name", value: "Сергеевич" },
    ]);

    expect(readPersonalDataListDescription(item)).toBe("Иван Петров");
  });

  it("falls back to first filled non-secret field", () => {
    const item = createPersonalDataItem([{ id: "phone", value: "+7 900 000-00-00" }]);

    expect(readPersonalDataListDescription(item)).toBe("+7 900 000-00-00");
  });
});

describe("itemPlaintextToListRecord", () => {
  it("maps description from first non-secret filled field", () => {
    const item = keyFormSectionsToItemPlaintext({
      itemId: "item-6",
      vaultId: "vault-1",
      title: "GitHub",
      categoryId: "login",
      nowMs: 1,
      sections: [
        {
          id: "login-password",
          variant: "primary",
          fields: [
            {
              id: "login",
              type: "text",
              label: "Login",
              value: "octocat",
              deletable: false,
              editableLabel: false,
              required: true,
            },
            {
              id: "password",
              type: "password",
              label: "Password",
              value: "secret",
              deletable: false,
              editableLabel: false,
              required: true,
            },
          ],
        },
      ],
    });

    const record = itemPlaintextToListRecord(item, { folderId: null, favorite: false });

    expect(record.description).toBe("octocat");
  });
});
