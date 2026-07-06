import type { KeyFormEditorField, KeyFormEditorSection, KeyFormSelectOption } from "../key-form/KeyFormEditor";
import type { KeyFormEditorMessages } from "../key-form/keyFormI18n";
import type { ItemCategoryId } from "./itemCategoryCatalog";

export const API_ACCESS_SECTION_ID = "api-access";

export function getApiAccessTypeSelectOptions(messages: KeyFormEditorMessages): KeyFormSelectOption[] {
  return [
    { value: "login-json", label: messages.apiTypeOptions.loginJson },
    { value: "jwt", label: messages.apiTypeOptions.jwt },
    { value: "bearer", label: messages.apiTypeOptions.bearer },
    { value: "other", label: messages.apiTypeOptions.other },
  ];
}

function getLoginDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
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
          deletable: false,
          required: true,
          urlAutofillScope: "entire-site",
        },
      ],
    },
  ];
}

function getApiAccessDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
  const typeSelectOptions = getApiAccessTypeSelectOptions(messages);

  return [
    {
      id: API_ACCESS_SECTION_ID,
      variant: "primary",
      fields: [
        {
          id: "api-name",
          type: "text",
          label: messages.fieldLabels.apiName,
          value: "",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "api-credentials",
          type: "secret",
          label: messages.fieldLabels.apiCredentials,
          value: "",
          copyValue: "",
          secretKind: "single-line",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "api-type",
          type: "select",
          label: messages.fieldLabels.apiType,
          value: "",
          selectOptions: typeSelectOptions,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "api-filename",
          type: "text",
          label: messages.fieldLabels.apiFilename,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "api-valid-from",
          type: "date",
          label: messages.fieldLabels.apiValidFrom,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "api-valid-to",
          type: "date",
          label: messages.fieldLabels.apiValidTo,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "api-hostname",
          type: "text",
          label: messages.fieldLabels.apiHostname,
          value: "",
          editableLabel: true,
          deletable: true,
        },
      ],
    },
  ];
}

export function getDefaultSectionsForCategory(
  categoryId: ItemCategoryId,
  messages: KeyFormEditorMessages,
): KeyFormEditorSection[] {
  if (categoryId === "login") {
    return getLoginDefaultSections(messages);
  }

  if (categoryId === "api_access") {
    return getApiAccessDefaultSections(messages);
  }

  return [];
}

export function enrichApiAccessSelectField(
  field: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  if (field.type !== "select" || field.id !== "api-type") {
    return field;
  }

  if (field.selectOptions && field.selectOptions.length > 0) {
    return field;
  }

  return {
    ...field,
    selectOptions: getApiAccessTypeSelectOptions(messages),
  };
}
