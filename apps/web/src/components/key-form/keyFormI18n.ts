import { formatWebMessage, getWebMessagePattern, type WebLocale } from "@okkey/i18n";
import { keyFieldTypeOptions, type KeyFieldTypeOption } from "@okkey/ui";

type Translate = (messageKey: string) => string;

export type PasswordStrengthLabelKey = "weak" | "fair" | "good" | "strong" | "excellent";

export type CrackTimeLabelKey =
  | "instantly"
  | "hours"
  | "days"
  | "months"
  | "years"
  | "decades"
  | "centuries"
  | "forever";

export type KeyFormUrlAutofillScope = "entire-site" | "exact-url" | "none";

export type KeyFormEditorMessages = {
  copy: string;
  copied: string;
  showPassword: string;
  hidePassword: string;
  showPin: string;
  hidePin: string;
  showSecret: string;
  hideSecret: string;
  generatePassword: string;
  generator: string;
  secretKind: {
    password: string;
    singleLine: string;
    multiLine: string;
  };
  enterNewTotpSecret: string;
  enableMask: string;
  disableMask: string;
  enableFullTextCopy: string;
  disableFullTextCopy: string;
  selectNoOptions: string;
  enterSelectEdit: string;
  exitSelectEdit: string;
  selectOptionsPlaceholder: string;
  showValue: string;
  deleteField: string;
  deleteSection: string;
  fieldSettingsAria: string;
  openWebsite: string;
  openMap: string;
  hideCodes: string;
  showCodes: string;
  allCodesUsed: string;
  addUrl: string;
  addTotp: string;
  sectionTitlePlaceholder: string;
  editSectionTitleAria: string;
  recoveryCodesPlaceholder: string;
  recoveryCodesCounter: string;
  passwordStrengthLabels: Record<PasswordStrengthLabelKey, string>;
  crackTimeLabels: Record<CrackTimeLabelKey, string>;
  fieldLabels: Record<string, string>;
  fieldPlaceholders: Record<string, string>;
  sectionTitles: {
    adminConsole: string;
  };
  cardExpiryExpired: string;
  apiTypeOptions: {
    loginJson: string;
    jwt: string;
    bearer: string;
    other: string;
  };
  dbTypeOptions: {
    postgresql: string;
    mysql: string;
    mssql: string;
    oracle: string;
    sqlite: string;
    mongodb: string;
    redis: string;
    cassandra: string;
    elasticsearch: string;
    snowflake: string;
    clickhouse: string;
    other: string;
  };
  wifiSecurityOptions: {
    wep: string;
    wpa: string;
    wpa2Enterprise: string;
    wpa2Personal: string;
    wpa3Enterprise: string;
    wpa3Personal: string;
    none: string;
  };
  urlAutofillScope: Record<KeyFormUrlAutofillScope, string>;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    searchCountries: string;
    noCountriesFound: string;
  };
  file: {
    upload: string;
    clear: string;
  };
  passwordGenerator: {
    uppercase: string;
    lowercase: string;
    numbers: string;
    symbols: string;
    charactersTemplate: string;
    lengthRange: string;
    lengthAria: string;
    copyGeneratedAria: string;
    regenerateAria: string;
    regenerate: string;
    strength: string;
    crackTime: string;
    cancel: string;
    insert: string;
  };
};

export function formatKeyFormMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

const KEY_FIELD_TYPE_IDS = keyFieldTypeOptions.map((type) => type.id);

/** Preset credential fields not listed in {@link keyFieldTypeOptions}. */
const KEY_FORM_EXTRA_FIELD_KEYS = [
  "login",
  "password",
  "apiName",
  "apiCredentials",
  "apiType",
  "apiFilename",
  "apiValidFrom",
  "apiValidTo",
  "apiHostname",
  "dbType",
  "dbServer",
  "dbPort",
  "dbDatabase",
  "dbUsername",
  "dbPassword",
  "dbSid",
  "dbAlias",
  "dbConnectionParams",
  "serverUrl",
  "serverLogin",
  "serverPassword",
  "adminConsoleUrl",
  "adminConsoleLogin",
  "adminConsolePassword",
  "wifiStationName",
  "wifiStationPassword",
  "wifiServerIp",
  "wifiAirportId",
  "wifiNetworkName",
  "wifiNetworkSecurity",
  "wifiNetworkPassword",
  "wifiConnectedStoragePassword",
  "cardNumber",
  "cardExpiry",
  "cardPin",
  "cardHolder",
  "select",
] as const;

const KEY_FORM_FIELD_KEYS = [...KEY_FIELD_TYPE_IDS, ...KEY_FORM_EXTRA_FIELD_KEYS];

export function createLocalizedKeyFieldTypes(locale: WebLocale): KeyFieldTypeOption[] {
  return keyFieldTypeOptions.map((type) => ({
    ...type,
    label: formatWebMessage(locale, `web.keyForm.types.${type.id}`),
  }));
}

export function createKeyFormEditorMessages(locale: WebLocale): KeyFormEditorMessages {
  const t: Translate = (messageKey) => formatWebMessage(locale, messageKey);
  const template: Translate = (messageKey) => getWebMessagePattern(locale, messageKey);
  const fieldLabels = Object.fromEntries(
    KEY_FORM_FIELD_KEYS.map((id) => [id, t(`web.keyForm.fieldLabels.${id}`)]),
  );
  const fieldPlaceholders = Object.fromEntries(
    KEY_FORM_FIELD_KEYS.map((id) => [id, t(`web.keyForm.fieldPlaceholders.${id}`)]),
  );

  return {
    copy: t("web.keyForm.copy"),
    copied: t("web.keyForm.copied"),
    showPassword: t("web.keyForm.showPassword"),
    hidePassword: t("web.keyForm.hidePassword"),
    showPin: t("web.keyForm.showPin"),
    hidePin: t("web.keyForm.hidePin"),
    showSecret: t("web.keyForm.showSecret"),
    hideSecret: t("web.keyForm.hideSecret"),
    generatePassword: t("web.keyForm.generatePassword"),
    generator: t("web.keyForm.generator"),
    secretKind: {
      password: t("web.keyForm.secretKind.password"),
      singleLine: t("web.keyForm.secretKind.singleLine"),
      multiLine: t("web.keyForm.secretKind.multiLine"),
    },
    enterNewTotpSecret: t("web.keyForm.enterNewTotpSecret"),
    enableMask: t("web.keyForm.enableMask"),
    disableMask: t("web.keyForm.disableMask"),
    enableFullTextCopy: t("web.keyForm.enableFullTextCopy"),
    disableFullTextCopy: t("web.keyForm.disableFullTextCopy"),
    selectNoOptions: t("web.keyForm.select.noOptions"),
    enterSelectEdit: t("web.keyForm.select.enterEdit"),
    exitSelectEdit: t("web.keyForm.select.exitEdit"),
    selectOptionsPlaceholder: t("web.keyForm.select.optionsPlaceholder"),
    showValue: t("web.keyForm.showValue"),
    deleteField: t("web.keyForm.deleteField"),
    deleteSection: t("web.keyForm.deleteSection"),
    fieldSettingsAria: template("web.keyForm.fieldSettingsAria"),
    openWebsite: t("web.keyForm.openWebsite"),
    openMap: t("web.keyForm.openMap"),
    hideCodes: t("web.keyForm.hideCodes"),
    showCodes: t("web.keyForm.showCodes"),
    allCodesUsed: t("web.keyForm.allCodesUsed"),
    addUrl: t("web.keyForm.addUrl"),
    addTotp: t("web.keyForm.addTotp"),
    sectionTitlePlaceholder: t("web.keyForm.sectionTitlePlaceholder"),
    editSectionTitleAria: t("web.keyForm.editSectionTitleAria"),
    recoveryCodesPlaceholder: t("web.keyForm.recoveryCodesPlaceholder"),
    recoveryCodesCounter: template("web.keyForm.recoveryCodesCounter"),
    passwordStrengthLabels: {
      weak: t("web.keyForm.strength.weak"),
      fair: t("web.keyForm.strength.fair"),
      good: t("web.keyForm.strength.good"),
      strong: t("web.keyForm.strength.strong"),
      excellent: t("web.keyForm.strength.excellent"),
    },
    crackTimeLabels: {
      instantly: t("web.keyForm.crackTime.instantly"),
      hours: t("web.keyForm.crackTime.hours"),
      days: t("web.keyForm.crackTime.days"),
      months: t("web.keyForm.crackTime.months"),
      years: t("web.keyForm.crackTime.years"),
      decades: t("web.keyForm.crackTime.decades"),
      centuries: t("web.keyForm.crackTime.centuries"),
      forever: t("web.keyForm.crackTime.forever"),
    },
    fieldLabels,
    fieldPlaceholders,
    sectionTitles: {
      adminConsole: t("web.keyForm.sectionTitles.adminConsole"),
    },
    cardExpiryExpired: t("web.keyForm.cardExpiryExpired"),
    apiTypeOptions: {
      loginJson: t("web.keyForm.apiType.loginJson"),
      jwt: t("web.keyForm.apiType.jwt"),
      bearer: t("web.keyForm.apiType.bearer"),
      other: t("web.keyForm.apiType.other"),
    },
    dbTypeOptions: {
      postgresql: t("web.keyForm.dbType.postgresql"),
      mysql: t("web.keyForm.dbType.mysql"),
      mssql: t("web.keyForm.dbType.mssql"),
      oracle: t("web.keyForm.dbType.oracle"),
      sqlite: t("web.keyForm.dbType.sqlite"),
      mongodb: t("web.keyForm.dbType.mongodb"),
      redis: t("web.keyForm.dbType.redis"),
      cassandra: t("web.keyForm.dbType.cassandra"),
      elasticsearch: t("web.keyForm.dbType.elasticsearch"),
      snowflake: t("web.keyForm.dbType.snowflake"),
      clickhouse: t("web.keyForm.dbType.clickhouse"),
      other: t("web.keyForm.dbType.other"),
    },
    wifiSecurityOptions: {
      wep: t("web.keyForm.wifiSecurity.wep"),
      wpa: t("web.keyForm.wifiSecurity.wpa"),
      wpa2Enterprise: t("web.keyForm.wifiSecurity.wpa2Enterprise"),
      wpa2Personal: t("web.keyForm.wifiSecurity.wpa2Personal"),
      wpa3Enterprise: t("web.keyForm.wifiSecurity.wpa3Enterprise"),
      wpa3Personal: t("web.keyForm.wifiSecurity.wpa3Personal"),
      none: t("web.keyForm.wifiSecurity.none"),
    },
    urlAutofillScope: {
      "entire-site": t("web.keyForm.urlAutofill.entireSite"),
      "exact-url": t("web.keyForm.urlAutofill.exactUrl"),
      none: t("web.keyForm.urlAutofill.none"),
    },
    address: {
      street: t("web.keyForm.address.street"),
      city: t("web.keyForm.address.city"),
      state: t("web.keyForm.address.state"),
      postalCode: t("web.keyForm.address.postalCode"),
      country: t("web.keyForm.address.country"),
      searchCountries: t("web.keyForm.address.searchCountries"),
      noCountriesFound: t("web.keyForm.address.noCountriesFound"),
    },
    file: {
      upload: t("web.keyForm.file.upload"),
      clear: t("web.keyForm.file.clear"),
    },
    passwordGenerator: {
      uppercase: t("web.keyForm.passwordGenerator.uppercase"),
      lowercase: t("web.keyForm.passwordGenerator.lowercase"),
      numbers: t("web.keyForm.passwordGenerator.numbers"),
      symbols: t("web.keyForm.passwordGenerator.symbols"),
      charactersTemplate: template("web.keyForm.passwordGenerator.characters"),
      lengthRange: t("web.keyForm.passwordGenerator.lengthRange"),
      lengthAria: t("web.keyForm.passwordGenerator.lengthAria"),
      copyGeneratedAria: t("web.keyForm.passwordGenerator.copyGeneratedAria"),
      regenerateAria: t("web.keyForm.passwordGenerator.regenerateAria"),
      regenerate: t("web.keyForm.passwordGenerator.regenerate"),
      strength: t("web.keyForm.passwordGenerator.strength"),
      crackTime: t("web.keyForm.passwordGenerator.crackTime"),
      cancel: t("web.keyForm.passwordGenerator.cancel"),
      insert: t("web.keyForm.passwordGenerator.insert"),
    },
  };
}

export const englishKeyFormEditorMessages = createKeyFormEditorMessages("en");
export const englishKeyFieldTypes = createLocalizedKeyFieldTypes("en");
