import { describe, expect, it } from "vitest";
import { englishKeyFormEditorMessages, PERSONAL_DATA_SECTION_ID } from "@okkey/vault-ui";
import type { ItemPlaintextV2 } from "@okkey/types";

import { buildPersonalDataBootstrapItem, hasPersonalDataItem } from "./personalDataBootstrap";

function textField(item: ItemPlaintextV2, fieldId: string): string {
  const field = item.fields.find((candidate) => candidate.id === fieldId);
  if (!field || field.value.kind !== "text") {
    return "";
  }
  return field.value.text;
}

describe("hasPersonalDataItem", () => {
  it("returns false when there is no personal_data item", () => {
    expect(
      hasPersonalDataItem([
        {
          schemaVersion: 2,
          itemId: "login-1",
          vaultId: "vault-1",
          title: "Login",
          categoryId: "login",
          createdAtMs: 1,
          updatedAtMs: 1,
          sections: [],
          fields: [],
        },
      ]),
    ).toBe(false);
  });

  it("ignores soft-deleted personal_data items", () => {
    expect(
      hasPersonalDataItem([
        {
          schemaVersion: 2,
          itemId: "pd-1",
          vaultId: "vault-1",
          title: "Personal data",
          categoryId: "personal_data",
          createdAtMs: 1,
          updatedAtMs: 1,
          deleted: true,
          sections: [],
          fields: [],
        },
      ]),
    ).toBe(false);
  });

  it("returns true when an active personal_data item exists", () => {
    expect(
      hasPersonalDataItem([
        {
          schemaVersion: 2,
          itemId: "pd-1",
          vaultId: "vault-1",
          title: "Personal data",
          categoryId: "personal_data",
          createdAtMs: 1,
          updatedAtMs: 1,
          sections: [],
          fields: [],
        },
      ]),
    ).toBe(true);
  });
});

describe("buildPersonalDataBootstrapItem", () => {
  it("prefills first name, last name, and email in the personal-data section", () => {
    const item = buildPersonalDataBootstrapItem({
      itemId: "item-pd",
      vaultId: "vault-personal",
      title: "Personal data",
      messages: englishKeyFormEditorMessages,
      firstName: " Саша ",
      lastName: "Иванов",
      email: "sasha@example.com",
      nowMs: 42,
    });

    expect(item.categoryId).toBe("personal_data");
    expect(item.vaultId).toBe("vault-personal");
    expect(item.title).toBe("Personal data");
    expect(item.createdAtMs).toBe(42);
    expect(item.sections.some((section) => section.id === PERSONAL_DATA_SECTION_ID)).toBe(true);
    expect(textField(item, "first-name")).toBe("Саша");
    expect(textField(item, "last-name")).toBe("Иванов");
    expect(textField(item, "email")).toBe("sasha@example.com");
  });
});
