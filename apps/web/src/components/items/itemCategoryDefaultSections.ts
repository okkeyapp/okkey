import type { KeyFormEditorField, KeyFormEditorSection, KeyFormSelectOption } from "../key-form/KeyFormEditor";
import type { KeyFormEditorMessages } from "../key-form/keyFormI18n";
import type { ItemCategoryId } from "./itemCategoryCatalog";

export const API_ACCESS_SECTION_ID = "api-access";
export const DATABASE_SECTION_ID = "database";
export const SERVER_SECTION_ID = "server";
export const SERVER_ADMIN_CONSOLE_SECTION_ID = "admin-console";
export const WIFI_ROUTER_SECTION_ID = "wifi-router";
export const CREDIT_CARD_SECTION_ID = "credit-card";

export const CREDIT_CARD_REQUIRED_FIELD_IDS = ["card-number", "card-expiry", "card-pin"] as const;

export function isCreditCardRequiredFieldId(fieldId: string): boolean {
  return (CREDIT_CARD_REQUIRED_FIELD_IDS as readonly string[]).includes(fieldId);
}

const FLEXIBLE_PRESET_PRIMARY_SECTION_IDS = [
  DATABASE_SECTION_ID,
  SERVER_SECTION_ID,
  WIFI_ROUTER_SECTION_ID,
] as const;

export function isFlexiblePresetPrimarySection(sectionId: string): boolean {
  return (FLEXIBLE_PRESET_PRIMARY_SECTION_IDS as readonly string[]).includes(sectionId);
}

export function isCreditCardPresetSection(sectionId: string): boolean {
  return sectionId === CREDIT_CARD_SECTION_ID;
}

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

function getServerDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
  return [
    {
      id: SERVER_SECTION_ID,
      variant: "primary",
      fields: [
        {
          id: "server-url",
          type: "text",
          label: messages.fieldLabels.serverUrl,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "server-login",
          type: "text",
          label: messages.fieldLabels.serverLogin,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "server-password",
          type: "secret",
          label: messages.fieldLabels.serverPassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
      ],
    },
    {
      id: SERVER_ADMIN_CONSOLE_SECTION_ID,
      variant: "additional",
      title: messages.sectionTitles.adminConsole,
      fields: [
        {
          id: "admin-console-url",
          type: "text",
          label: messages.fieldLabels.adminConsoleUrl,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "admin-console-login",
          type: "text",
          label: messages.fieldLabels.adminConsoleLogin,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "admin-console-password",
          type: "secret",
          label: messages.fieldLabels.adminConsolePassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
      ],
    },
  ];
}

export function getAllServerPresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  return getServerDefaultSections(messages).flatMap((section) => section.fields);
}

export function getWifiRouterSecuritySelectOptions(messages: KeyFormEditorMessages): KeyFormSelectOption[] {
  return [
    { value: "wep", label: messages.wifiSecurityOptions.wep },
    { value: "wpa", label: messages.wifiSecurityOptions.wpa },
    { value: "wpa2-enterprise", label: messages.wifiSecurityOptions.wpa2Enterprise },
    { value: "wpa2-personal", label: messages.wifiSecurityOptions.wpa2Personal },
    { value: "wpa3-enterprise", label: messages.wifiSecurityOptions.wpa3Enterprise },
    { value: "wpa3-personal", label: messages.wifiSecurityOptions.wpa3Personal },
    { value: "none", label: messages.wifiSecurityOptions.none },
  ];
}

function getWifiRouterDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
  const securitySelectOptions = getWifiRouterSecuritySelectOptions(messages);

  return [
    {
      id: WIFI_ROUTER_SECTION_ID,
      variant: "primary",
      fields: [
        {
          id: "wifi-station-name",
          type: "text",
          label: messages.fieldLabels.wifiStationName,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-station-password",
          type: "secret",
          label: messages.fieldLabels.wifiStationPassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-server-ip",
          type: "text",
          label: messages.fieldLabels.wifiServerIp,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-airport-id",
          type: "text",
          label: messages.fieldLabels.wifiAirportId,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-network-name",
          type: "text",
          label: messages.fieldLabels.wifiNetworkName,
          value: "",
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-network-security",
          type: "select",
          label: messages.fieldLabels.wifiNetworkSecurity,
          value: "",
          selectOptions: securitySelectOptions,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-network-password",
          type: "secret",
          label: messages.fieldLabels.wifiNetworkPassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
        {
          id: "wifi-connected-storage-password",
          type: "secret",
          label: messages.fieldLabels.wifiConnectedStoragePassword,
          value: "",
          copyValue: "",
          secretKind: "password",
          secret: true,
          editableLabel: true,
          deletable: true,
        },
      ],
    },
  ];
}

export function getAllWifiRouterPresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  return getWifiRouterDefaultSections(messages)[0]?.fields ?? [];
}

function getCreditCardDefaultSections(messages: KeyFormEditorMessages): KeyFormEditorSection[] {
  return [
    {
      id: CREDIT_CARD_SECTION_ID,
      variant: "primary",
      fields: [
        {
          id: "card-number",
          type: "card",
          label: messages.fieldLabels.cardNumber,
          value: "",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "card-expiry",
          type: "card-expiry",
          label: messages.fieldLabels.cardExpiry,
          value: "",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "card-pin",
          type: "pin",
          label: messages.fieldLabels.cardPin,
          value: "",
          copyValue: "",
          editableLabel: false,
          deletable: false,
          required: true,
        },
        {
          id: "card-holder",
          type: "text",
          label: messages.fieldLabels.cardHolder,
          value: "",
          editableLabel: false,
          deletable: false,
        },
      ],
    },
  ];
}

export function getAllCreditCardPresetFields(messages: KeyFormEditorMessages): KeyFormEditorField[] {
  return getCreditCardDefaultSections(messages)[0]?.fields ?? [];
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

  if (categoryId === "server") {
    return getServerDefaultSections(messages);
  }

  if (categoryId === "wifi_router") {
    return getWifiRouterDefaultSections(messages);
  }

  if (categoryId === "credit_card") {
    return getCreditCardDefaultSections(messages);
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

export function enrichWifiRouterSelectField(
  field: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  if (field.type !== "select" || field.id !== "wifi-network-security") {
    return field;
  }

  if (field.selectOptions && field.selectOptions.length > 0) {
    return field;
  }

  return {
    ...field,
    selectOptions: getWifiRouterSecuritySelectOptions(messages),
  };
}

export function enrichCategoryPresetSelectField(
  field: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichWifiRouterSelectField(
    enrichDatabaseSelectField(enrichApiAccessSelectField(field, messages), messages),
    messages,
  );
}
