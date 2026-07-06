import type { KeyFormEditorField, KeyFormEditorSection, KeyFormSelectOption } from "../key-form/KeyFormEditor";
import type { KeyFormEditorMessages } from "../key-form/keyFormI18n";
import type { ItemCategoryId } from "./itemCategoryCatalog";

export const API_ACCESS_SECTION_ID = "api-access";
export const DATABASE_SECTION_ID = "database";

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

function getApiAccessOptionalPresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  const typeSelectOptions = getApiAccessTypeSelectOptions(messages);

  return [
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
  ];
}

function getApiAccessDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
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
        ...getApiAccessOptionalPresetFields(messages),
      ],
    },
  ];
}

export function getAllApiAccessPresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  return getApiAccessDefaultSections(messages)[0]?.fields ?? [];
}

export function getDatabaseTypeSelectOptions(messages: KeyFormEditorMessages): KeyFormSelectOption[] {
  return [
    { value: "postgresql", label: messages.dbTypeOptions.postgresql },
    { value: "mysql", label: messages.dbTypeOptions.mysql },
    { value: "mssql", label: messages.dbTypeOptions.mssql },
    { value: "oracle", label: messages.dbTypeOptions.oracle },
    { value: "sqlite", label: messages.dbTypeOptions.sqlite },
    { value: "mongodb", label: messages.dbTypeOptions.mongodb },
    { value: "redis", label: messages.dbTypeOptions.redis },
    { value: "cassandra", label: messages.dbTypeOptions.cassandra },
    { value: "elasticsearch", label: messages.dbTypeOptions.elasticsearch },
    { value: "snowflake", label: messages.dbTypeOptions.snowflake },
    { value: "clickhouse", label: messages.dbTypeOptions.clickhouse },
    { value: "other", label: messages.dbTypeOptions.other },
  ];
}

function getDatabaseDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
  const typeSelectOptions = getDatabaseTypeSelectOptions(messages);

  return [
    {
      id: DATABASE_SECTION_ID,
      variant: "primary",
      fields: [
        {
          id: "db-type",
          type: "select",
          label: messages.fieldLabels.dbType,
          value: "",
          selectOptions: typeSelectOptions,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-server",
          type: "text",
          label: messages.fieldLabels.dbServer,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-port",
          type: "text",
          label: messages.fieldLabels.dbPort,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-database",
          type: "text",
          label: messages.fieldLabels.dbDatabase,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-username",
          type: "text",
          label: messages.fieldLabels.dbUsername,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-password",
          type: "secret",
          label: messages.fieldLabels.dbPassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-sid",
          type: "text",
          label: messages.fieldLabels.dbSid,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-alias",
          type: "text",
          label: messages.fieldLabels.dbAlias,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "db-connection-params",
          type: "text",
          label: messages.fieldLabels.dbConnectionParams,
          value: "",
          editableLabel: true,
          deletable: true,
        },
      ],
    },
  ];
}

export function getAllDatabasePresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  return getDatabaseDefaultSections(messages)[0]?.fields ?? [];
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

  if (categoryId === "database") {
    return getDatabaseDefaultSections(messages);
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

export function enrichDatabaseSelectField(
  field: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  if (field.type !== "select" || field.id !== "db-type") {
    return field;
  }

  if (field.selectOptions && field.selectOptions.length > 0) {
    return field;
  }

  return {
    ...field,
    selectOptions: getDatabaseTypeSelectOptions(messages),
  };
}

export function enrichCategoryPresetSelectField(
  field: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichDatabaseSelectField(enrichApiAccessSelectField(field, messages), messages);
}
