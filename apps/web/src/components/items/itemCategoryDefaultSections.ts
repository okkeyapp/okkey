import type { KeyFormEditorSection } from "../key-form/KeyFormEditor";
import type { KeyFormEditorMessages } from "../key-form/keyFormI18n";
import type { ItemCategoryId } from "./itemCategoryCatalog";

export function getDefaultSectionsForCategory(
  categoryId: ItemCategoryId,
  messages: KeyFormEditorMessages,
): KeyFormEditorSection[] {
  if (categoryId !== "login") {
    return [];
  }

  return [
    {
      id: "credentials",
      variant: "primary",
      fields: [
        {
          id: "login",
          type: "text",
          label: messages.fieldLabels.login ?? messages.fieldLabels.text,
          value: "",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "password",
          type: "password",
          label: messages.fieldLabels.password,
          value: "",
          copyValue: "",
          secret: true,
          editableLabel: false,
          deletable: false,
          required: true,
        },
      ],
    },
    {
      id: "websites",
      variant: "primary",
      fields: [
        {
          id: "website-1",
          type: "url",
          label: messages.fieldLabels.url,
          value: "",
          copyValue: "",
          editableLabel: true,
          deletable: true,
          required: true,
          urlAutofillScope: "entire-site",
        },
      ],
    },
  ];
}
