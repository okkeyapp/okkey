import { describe, expect, it } from "vitest";

import { createKeyFormEditorMessages } from "../components/key-form/keyFormI18n";
import { getDefaultSectionsForCategory } from "../components/items/itemCategoryDefaultSections";
import { itemPlaintextToKeyFormSections } from "./itemPlaintextToKeyFormSections";
import { keyFormSectionsToItemPlaintext } from "./keyFormToItemPlaintext";

const messages = createKeyFormEditorMessages("ru");

describe("itemPlaintextToKeyFormSections api_access", () => {
  it("does not restore empty optional preset fields after save", () => {
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

    expect(item.fields.map((field) => field.id)).toEqual(["api-name", "api-credentials"]);

    const restored = itemPlaintextToKeyFormSections(item, messages);
    const restoredFieldIds = restored[0]?.fields.map((field) => field.id) ?? [];

    expect(restoredFieldIds).toEqual(["api-name", "api-credentials"]);
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
