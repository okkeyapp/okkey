import { describe, expect, it } from "vitest";

import { createKeyFormEditorMessages } from "./keyFormI18n.js";
import { resolveKeyFormFieldLabel } from "./keyFormFieldLabel.js";
import { keyFormSectionsToItemPlaintext } from "../items/keyFormToItemPlaintext.js";
import { itemPlaintextToKeyFormSections } from "../items/itemPlaintextToKeyFormSections.js";

describe("resolveKeyFormFieldLabel", () => {
  it("translates saved default login label when locale changes", () => {
    const ruMessages = createKeyFormEditorMessages("ru");
    const enMessages = createKeyFormEditorMessages("en");

    const savedLabel = ruMessages.fieldLabels.login;
    const resolved = resolveKeyFormFieldLabel(
      { id: "login", type: "text", label: savedLabel, editableLabel: false },
      enMessages,
      { sectionId: "credentials" },
    );

    expect(resolved).toBe(enMessages.fieldLabels.login);
    expect(resolved).not.toBe(savedLabel);
  });

  it("keeps manually customized labels across locales", () => {
    const enMessages = createKeyFormEditorMessages("en");
    const ruMessages = createKeyFormEditorMessages("ru");

    const customLabel = "Corporate login";
    const resolvedEn = resolveKeyFormFieldLabel(
      { id: "login", type: "text", label: customLabel, editableLabel: true },
      enMessages,
      { sectionId: "credentials" },
    );
    const resolvedRu = resolveKeyFormFieldLabel(
      { id: "login", type: "text", label: customLabel, editableLabel: true },
      ruMessages,
      { sectionId: "credentials" },
    );

    expect(resolvedEn).toBe(customLabel);
    expect(resolvedRu).toBe(customLabel);
  });

  it("restores translated labels for saved items in card view", () => {
    const ruMessages = createKeyFormEditorMessages("ru");
    const enMessages = createKeyFormEditorMessages("en");

    const item = keyFormSectionsToItemPlaintext({
      sections: [
        {
          id: "credentials",
          variant: "primary",
          fields: [
            {
              id: "login",
              type: "text",
              label: ruMessages.fieldLabels.login,
              value: "user@example.com",
              editableLabel: false,
              deletable: false,
              required: true,
            },
            {
              id: "password",
              type: "password",
              label: ruMessages.fieldLabels.password,
              value: "secret",
              editableLabel: false,
              deletable: false,
              required: true,
            },
          ],
        },
      ],
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Login",
      categoryId: "login",
      nowMs: 1,
    });

    const restored = itemPlaintextToKeyFormSections(item, enMessages);
    const credentials = restored.find((section) => section.id === "credentials");

    expect(credentials?.fields.find((field) => field.id === "login")?.label).toBe(
      enMessages.fieldLabels.login,
    );
    expect(credentials?.fields.find((field) => field.id === "password")?.label).toBe(
      enMessages.fieldLabels.password,
    );
  });
});
