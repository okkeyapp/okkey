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
  generatePassword: string;
  enterNewTotpSecret: string;
  enableMask: string;
  disableMask: string;
  enableFullTextCopy: string;
  disableFullTextCopy: string;
  showValue: string;
  deleteField: string;
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
    [...KEY_FIELD_TYPE_IDS, "login"].map((id) => [id, t(`web.keyForm.fieldLabels.${id}`)]),
  );
  const fieldPlaceholders = Object.fromEntries(
    KEY_FIELD_TYPE_IDS.map((id) => [id, t(`web.keyForm.fieldPlaceholders.${id}`)]),
  );

  return {
    copy: t("web.keyForm.copy"),
    copied: t("web.keyForm.copied"),
    showPassword: t("web.keyForm.showPassword"),
    hidePassword: t("web.keyForm.hidePassword"),
    generatePassword: t("web.keyForm.generatePassword"),
    enterNewTotpSecret: t("web.keyForm.enterNewTotpSecret"),
    enableMask: t("web.keyForm.enableMask"),
    disableMask: t("web.keyForm.disableMask"),
    enableFullTextCopy: t("web.keyForm.enableFullTextCopy"),
    disableFullTextCopy: t("web.keyForm.disableFullTextCopy"),
    showValue: t("web.keyForm.showValue"),
    deleteField: t("web.keyForm.deleteField"),
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
