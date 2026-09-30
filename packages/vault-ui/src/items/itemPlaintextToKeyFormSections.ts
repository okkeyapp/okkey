import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { coerceRecoveryCodesRawToFormValue, coerceSecretRawToFormValue, formatCardExpiry, formatCardNumber, getSecretKindFromRaw, normalizePinValue, serializeKeyFieldFileValue } from "@okkey/ui";

import type { KeyFormEditorField, KeyFormEditorSection } from "../key-form/KeyFormEditor.js";
import type { KeyFormEditorMessages } from "../key-form/keyFormI18n.js";
import { resolveKeyFormFieldLabel } from "../key-form/keyFormFieldLabel.js";
import {
  API_ACCESS_SECTION_ID,
  BANK_ACCOUNT_SECTION_ID,
  BANK_DETAILS_SECTION_ID,
  CRYPTO_WALLET_SECTION_ID,
  CRYPTO_WALLET_WALLET_SECTION_ID,
  DATABASE_SECTION_ID,
  PERSONAL_DATA_SECTION_ID,
  PERSONAL_DATA_WORK_SECTION_ID,
  SERVER_ADMIN_CONSOLE_SECTION_ID,
  SERVER_SECTION_ID,
  WIFI_ROUTER_SECTION_ID,
  CREDIT_CARD_SECTION_ID,
  PASSPORT_SECTION_ID,
  SECURE_FILES_SECTION_ID,
  SECURE_NOTE_SECTION_ID,
  enrichCategoryPresetSelectField,
  getAllApiAccessPresetFields,
  getAllCreditCardPresetFields,
  getAllDatabasePresetFields,
  getAllPassportPresetFields,
  getAllPersonalDataPrimaryPresetFields,
  getAllSecureFilesPresetFields,
  getAllSecureNotePresetFields,
  getAllWifiRouterPresetFields,
  getDefaultSectionsForCategory,
  isCreditCardRequiredFieldId,
  isPassportPresetFieldId,
  isPersonalDataPresetFieldId,
} from "./itemCategoryDefaultSections.js";
import { isItemCategoryId } from "./itemCategoryCatalog.js";
import { filterFilledKeyFormSections, isItemFieldFilled } from "./keyFormFilledFields.js";
import { parseSelectFieldValueFromItem, selectFieldValueFromRaw } from "./keyFormSelectField.js";

function formFieldType(field: ItemFieldV2): string {
  if (field.id === "card-number") {
    return "card";
  }
  if (field.id === "card-expiry") {
    return "card-expiry";
  }
  if (field.id === "card-pin") {
    return "pin";
  }

  if (field.type === "note") {
    return "multiline-text";
  }
  if (field.type === "recovery-codes") {
    return "recovery-codes";
  }
  if (field.type === "select") {
    return "select";
  }
  if (field.value.kind === "unknown" && field.value.declaredType === "secret") {
    return "secret";
  }
  if (field.value.kind === "unknown" && field.value.declaredType === "recovery-codes") {
    return "recovery-codes";
  }
  if (field.value.kind === "unknown" && field.value.declaredType === "select") {
    return "select";
  }
  return field.type;
}

function stringValueFromField(field: ItemFieldV2): string {
  switch (field.value.kind) {
    case "text":
      return field.value.text;
    case "password":
      return field.value.password;
    case "url":
      return field.value.url;
    case "totp":
      return field.value.secretBase32;
    case "note":
      return field.value.note;
    case "file":
      if (field.value.kind === "file") {
        const fileValue = field.value;
        if (fileValue.attachmentId?.trim()) {
          return serializeKeyFieldFileValue({
            attachmentId: fileValue.attachmentId.trim(),
            name: fileValue.name ?? "",
            mimeType: fileValue.mimeType ?? "application/octet-stream",
            sizeBytes: fileValue.sizeBytes ?? 0,
            url: fileValue.url?.trim() || undefined,
          });
        }
        return fileValue.name ?? "";
      }
      return "";
    case "unknown":
      if (field.value.declaredType === "recovery-codes") {
        return coerceRecoveryCodesRawToFormValue(field.value.raw);
      }
      if (field.value.declaredType === "secret") {
        return coerceSecretRawToFormValue(field.value.raw);
      }
      if (field.value.declaredType === "select") {
        return selectFieldValueFromRaw(field.value.raw);
      }
      return "";
    default:
      return "";
  }
}

const DEFAULT_SECTION_TITLES: Record<string, string> = {
  credentials: "General",
  websites: "Websites",
  additional: "Additional",
  [API_ACCESS_SECTION_ID]: "API Access",
  [DATABASE_SECTION_ID]: "Database",
  [WIFI_ROUTER_SECTION_ID]: "Wi‑Fi router",
  [CREDIT_CARD_SECTION_ID]: "Credit card",
  [PERSONAL_DATA_SECTION_ID]: "Personal data",
  [PERSONAL_DATA_WORK_SECTION_ID]: "Work",
  [PASSPORT_SECTION_ID]: "Passport",
  [SERVER_ADMIN_CONSOLE_SECTION_ID]: "Admin console",
  [BANK_DETAILS_SECTION_ID]: "Bank details",
  [CRYPTO_WALLET_WALLET_SECTION_ID]: "Wallet",
};

function sectionTitleForForm(section: { id: string; title?: string; isPreset?: boolean } | undefined): string | undefined {
  if (!section) {
    return undefined;
  }
  const raw = section.title?.trim();
  if (!raw || section.isPreset || raw === section.id || DEFAULT_SECTION_TITLES[section.id] === raw) {
    return undefined;
  }
  return raw;
}

function isFieldDeletable(
  sectionId: string,
  field: ItemFieldV2,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
): boolean {
  const type = formFieldType(field);

  if (!isPresetSection) {
    return true;
  }

  if (sectionId === "credentials") {
    if (field.id === "login" || field.id === "password") {
      return false;
    }
    if (type === "totp") {
      return true;
    }
    if (type === "password" || type === "text") {
      return false;
    }
    return false;
  }

  if (sectionId === API_ACCESS_SECTION_ID) {
    if (field.id === "api-name" || field.id === "api-credentials") {
      return false;
    }
    return true;
  }

  if (sectionId === CREDIT_CARD_SECTION_ID) {
    return false;
  }

  if (sectionId === PERSONAL_DATA_SECTION_ID) {
    return !isPersonalDataPresetFieldId(field.id);
  }

  if (sectionId === PASSPORT_SECTION_ID) {
    return !isPassportPresetFieldId(field.id);
  }

  if (sectionId === SECURE_FILES_SECTION_ID) {
    return sectionFields.length > 1;
  }

  if (sectionId === SECURE_NOTE_SECTION_ID) {
    return sectionFields.length > 1;
  }

  if (sectionId === DATABASE_SECTION_ID || sectionId === WIFI_ROUTER_SECTION_ID) {
    return sectionFields.length > 1;
  }

  if (sectionId === SERVER_SECTION_ID || sectionId === BANK_ACCOUNT_SECTION_ID || sectionId === CRYPTO_WALLET_SECTION_ID) {
    return sectionFields.length > 1;
  }

  if (sectionId === SERVER_ADMIN_CONSOLE_SECTION_ID || sectionId === BANK_DETAILS_SECTION_ID || sectionId === CRYPTO_WALLET_WALLET_SECTION_ID || sectionId === PERSONAL_DATA_WORK_SECTION_ID) {
    return true;
  }

  if (sectionId === "websites" && type === "url") {
    return sectionFields.filter((candidate) => formFieldType(candidate) === "url").length > 1;
  }

  return false;
}

function isFieldLabelEditable(
  sectionId: string,
  field: ItemFieldV2,
  isPresetSection: boolean,
): boolean {
  if (!isPresetSection) {
    return true;
  }

  if (sectionId === "websites" && formFieldType(field) === "url") {
    return true;
  }

  if (sectionId === API_ACCESS_SECTION_ID) {
    return field.id !== "api-name" && field.id !== "api-credentials";
  }

  if (sectionId === CREDIT_CARD_SECTION_ID) {
    return false;
  }

  if (sectionId === PERSONAL_DATA_SECTION_ID) {
    return !isPersonalDataPresetFieldId(field.id);
  }

  if (sectionId === PASSPORT_SECTION_ID) {
    return !isPassportPresetFieldId(field.id);
  }

  if (sectionId === SECURE_FILES_SECTION_ID) {
    return true;
  }

  if (sectionId === SECURE_NOTE_SECTION_ID) {
    return true;
  }

  if (sectionId === DATABASE_SECTION_ID || sectionId === WIFI_ROUTER_SECTION_ID) {
    return true;
  }

  if (sectionId === SERVER_SECTION_ID || sectionId === SERVER_ADMIN_CONSOLE_SECTION_ID || sectionId === BANK_ACCOUNT_SECTION_ID || sectionId === BANK_DETAILS_SECTION_ID || sectionId === CRYPTO_WALLET_SECTION_ID || sectionId === CRYPTO_WALLET_WALLET_SECTION_ID || sectionId === PERSONAL_DATA_WORK_SECTION_ID) {
    return true;
  }

  return false;
}

function isFieldRequired(
  sectionId: string,
  field: ItemFieldV2,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
): boolean {
  if (!isPresetSection) {
    return false;
  }

  if (sectionId === "credentials" && (field.id === "login" || field.type === "password")) {
    return true;
  }

  if (sectionId === API_ACCESS_SECTION_ID && (field.id === "api-name" || field.id === "api-credentials")) {
    return true;
  }

  if (sectionId === CREDIT_CARD_SECTION_ID) {
    return isCreditCardRequiredFieldId(field.id);
  }

  if (sectionId === DATABASE_SECTION_ID || sectionId === WIFI_ROUTER_SECTION_ID) {
    return false;
  }

  if (sectionId === SERVER_SECTION_ID || sectionId === SERVER_ADMIN_CONSOLE_SECTION_ID || sectionId === BANK_ACCOUNT_SECTION_ID || sectionId === BANK_DETAILS_SECTION_ID || sectionId === CRYPTO_WALLET_SECTION_ID || sectionId === CRYPTO_WALLET_WALLET_SECTION_ID) {
    return false;
  }

  if (sectionId === "websites" && formFieldType(field) === "url") {
    return sectionFields.filter((candidate) => formFieldType(candidate) === "url").length > 0;
  }

  return false;
}

type MergePresetFieldFn = (
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
) => KeyFormEditorField;

function mergePresetFieldsPreservingOrder(input: {
  loadedFields: readonly KeyFormEditorField[];
  presetFieldsById: ReadonlyMap<string, KeyFormEditorField>;
  mergeField: MergePresetFieldFn;
  includeMissingPresets: boolean;
  presetFieldOrder: readonly KeyFormEditorField[];
  isMissingPresetIncluded?: (presetField: KeyFormEditorField) => boolean;
  enrichCustomField?: (field: KeyFormEditorField) => KeyFormEditorField;
}): KeyFormEditorField[] {
  const {
    loadedFields,
    presetFieldsById,
    mergeField,
    includeMissingPresets,
    presetFieldOrder,
    isMissingPresetIncluded = () => true,
    enrichCustomField = (field) => field,
  } = input;

  const merged: KeyFormEditorField[] = [];
  const seenPresetIds = new Set<string>();

  for (const loadedField of loadedFields) {
    const presetField = presetFieldsById.get(loadedField.id);
    if (presetField) {
      merged.push(mergeField(presetField, loadedField));
      seenPresetIds.add(loadedField.id);
      continue;
    }
    merged.push(enrichCustomField(loadedField));
  }

  if (!includeMissingPresets) {
    return merged;
  }

  for (const presetField of presetFieldOrder) {
    if (seenPresetIds.has(presetField.id) || !isMissingPresetIncluded(presetField)) {
      continue;
    }
    merged.push(presetField);
  }

  return merged;
}

function mergePresetSectionsPreservingOrder(input: {
  loadedSections: readonly KeyFormEditorSection[];
  defaultSections: readonly KeyFormEditorSection[];
  includeMissingSections: boolean;
  mergeSection: (defaultSection: KeyFormEditorSection, loadedSection: KeyFormEditorSection) => KeyFormEditorSection;
}): KeyFormEditorSection[] {
  const { loadedSections, defaultSections, includeMissingSections, mergeSection } = input;
  const defaultsById = new Map(defaultSections.map((section) => [section.id, section]));
  const merged: KeyFormEditorSection[] = [];
  const seenPresetSectionIds = new Set<string>();

  for (const loadedSection of loadedSections) {
    const defaultSection = defaultsById.get(loadedSection.id);
    if (defaultSection) {
      merged.push(mergeSection(defaultSection, loadedSection));
      seenPresetSectionIds.add(loadedSection.id);
      continue;
    }
    merged.push(loadedSection);
  }

  if (!includeMissingSections) {
    return merged;
  }

  for (const defaultSection of defaultSections) {
    if (seenPresetSectionIds.has(defaultSection.id)) {
      continue;
    }

    const defaultIndex = defaultSections.findIndex((section) => section.id === defaultSection.id);
    let insertAt = merged.length;

    for (let index = defaultIndex - 1; index >= 0; index -= 1) {
      const priorId = defaultSections[index]?.id;
      if (priorId && seenPresetSectionIds.has(priorId)) {
        insertAt = merged.findIndex((section) => section.id === priorId) + 1;
        break;
      }
    }

    if (insertAt === merged.length && defaultIndex === 0) {
      insertAt = 0;
    }

    merged.splice(insertAt, 0, defaultSection);
    seenPresetSectionIds.add(defaultSection.id);
  }

  return merged;
}

function mergeLoginPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("login", messages);

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => {
      if (defaultSection.id === "websites") {
        const urlFields = loadedSection.fields.filter((field) => field.type === "url");
        if (urlFields.length === 0) {
          return includeEmptyFields ? defaultSection : { ...defaultSection, ...loadedSection, fields: [] };
        }

        return {
          ...defaultSection,
          ...loadedSection,
          fields: urlFields.map((field) => ({
            ...field,
            required: true,
            deletable: urlFields.length > 1,
            editableLabel: true,
          })),
        };
      }

      if (defaultSection.id === "credentials") {
        const presetFieldsById = new Map(defaultSection.fields.map((field) => [field.id, field]));

        return {
          ...defaultSection,
          ...loadedSection,
          fields: mergePresetFieldsPreservingOrder({
            loadedFields: loadedSection.fields,
            presetFieldsById,
            presetFieldOrder: defaultSection.fields,
            includeMissingPresets: includeEmptyFields,
            mergeField: (presetField, loadedField) => ({
              ...presetField,
              ...loadedField,
              deletable: false,
              required: true,
              editableLabel: false,
              secret: presetField.id === "password" ? true : loadedField.secret,
            }),
          }),
        };
      }

      return {
        ...defaultSection,
        ...loadedSection,
      };
    },
  });
}

function isApiAccessRequiredField(fieldId: string): boolean {
  return fieldId === "api-name" || fieldId === "api-credentials";
}

function mergeApiAccessPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField | undefined,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  if (!loadedField) {
    return presetField;
  }

  if (isApiAccessRequiredField(presetField.id)) {
    return enrichCategoryPresetSelectField(
      {
        ...presetField,
        ...loadedField,
        deletable: false,
        editableLabel: false,
        required: true,
        ...(presetField.id === "api-credentials"
          ? { type: "secret" as const, secretKind: "single-line" as const }
          : {}),
      },
      messages,
    );
  }

  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      deletable: true,
      editableLabel: true,
    },
    messages,
  );
}

function mergeApiAccessPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("api_access", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllApiAccessPresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: true,
        isMissingPresetIncluded: (presetField) => isApiAccessRequiredField(presetField.id),
        mergeField: (presetField, loadedField) => mergeApiAccessPresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      }),
    }),
  });
}

function mergeDatabasePresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      deletable: true,
      editableLabel: true,
      required: false,
      ...(presetField.id === "db-password"
        ? { type: "secret" as const, secretKind: "password" as const, secret: true }
        : {}),
    },
    messages,
  );
}

function mergeDatabasePresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("database", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllDatabasePresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: false,
        mergeField: (presetField, loadedField) => mergeDatabasePresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      }),
    }),
  });
}

function mergeServerPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
): KeyFormEditorField {
  return {
    ...presetField,
    ...loadedField,
    deletable: true,
    editableLabel: true,
    required: false,
    ...(presetField.id === "server-password" || presetField.id === "admin-console-password"
      ? { type: "secret" as const, secretKind: "password" as const, secret: true }
      : {}),
  };
}

function mergeServerPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("server", messages);

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      title: defaultSection.title ?? loadedSection.title,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById: new Map(defaultSection.fields.map((field) => [field.id, field])),
        presetFieldOrder: defaultSection.fields,
        includeMissingPresets: false,
        mergeField: mergeServerPresetField,
      }),
    }),
  });
}

function mergeBankAccountPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
): KeyFormEditorField {
  return {
    ...presetField,
    ...loadedField,
    deletable: true,
    editableLabel: true,
    required: false,
  };
}

function mergeBankAccountPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("bank_account", messages);

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      title: defaultSection.title ?? loadedSection.title,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById: new Map(defaultSection.fields.map((field) => [field.id, field])),
        presetFieldOrder: defaultSection.fields,
        includeMissingPresets: false,
        mergeField: mergeBankAccountPresetField,
      }),
    }),
  });
}

function mergeCryptoWalletPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
): KeyFormEditorField {
  const isSingleLineSecret = presetField.id === "crypto-access-pin" || presetField.id === "crypto-passphrase";

  return {
    ...presetField,
    ...loadedField,
    deletable: true,
    editableLabel: true,
    required: false,
    ...(isSingleLineSecret
      ? { type: "secret" as const, secretKind: "single-line" as const, secret: true }
      : {}),
  };
}

function mergeCryptoWalletPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("crypto_wallet", messages);

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      title: defaultSection.title ?? loadedSection.title,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById: new Map(defaultSection.fields.map((field) => [field.id, field])),
        presetFieldOrder: defaultSection.fields,
        includeMissingPresets: false,
        mergeField: mergeCryptoWalletPresetField,
      }),
    }),
  });
}

function mergeWifiRouterPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  const isPasswordSecret =
    presetField.id === "wifi-station-password" ||
    presetField.id === "wifi-network-password" ||
    presetField.id === "wifi-connected-storage-password";

  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      deletable: true,
      editableLabel: true,
      required: false,
      ...(isPasswordSecret ? { type: "secret" as const, secretKind: "password" as const, secret: true } : {}),
    },
    messages,
  );
}

function mergeWifiRouterPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("wifi_router", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllWifiRouterPresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: false,
        mergeField: (presetField, loadedField) => mergeWifiRouterPresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      }),
    }),
  });
}

function mergeCreditCardPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
): KeyFormEditorField {
  let value = typeof loadedField.value === "string" ? loadedField.value : "";

  if (presetField.type === "card") {
    value = formatCardNumber(value);
  }
  if (presetField.type === "card-expiry") {
    value = formatCardExpiry(value);
  }
  if (presetField.type === "pin") {
    value = normalizePinValue(value);
  }

  return {
    ...presetField,
    ...loadedField,
    type: presetField.type,
    value,
    copyValue: presetField.type === "pin" ? value : loadedField.copyValue,
    deletable: false,
    editableLabel: false,
    required: presetField.required ?? isCreditCardRequiredFieldId(presetField.id),
  };
}

function mergeCreditCardPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("credit_card", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllCreditCardPresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: includeEmptyFields,
        mergeField: mergeCreditCardPresetField,
      }),
    }),
  });
}

function mergePersonalDataPrimaryPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      deletable: false,
      editableLabel: false,
      required: false,
    },
    messages,
  );
}

function mergePersonalDataWorkPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
): KeyFormEditorField {
  return {
    ...presetField,
    ...loadedField,
    deletable: true,
    editableLabel: true,
    required: false,
  };
}

function mergePersonalDataPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("personal_data", messages);
  const primaryPresetFields = getAllPersonalDataPrimaryPresetFields(messages);
  const primaryPresetFieldsById = new Map(primaryPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => {
      if (defaultSection.id === PERSONAL_DATA_SECTION_ID) {
        return {
          ...defaultSection,
          ...loadedSection,
          fields: mergePresetFieldsPreservingOrder({
            loadedFields: loadedSection.fields,
            presetFieldsById: primaryPresetFieldsById,
            presetFieldOrder: primaryPresetFields,
            includeMissingPresets: includeEmptyFields,
            mergeField: (presetField, loadedField) =>
              mergePersonalDataPrimaryPresetField(presetField, loadedField, messages),
            enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
          }),
        };
      }

      if (defaultSection.id === PERSONAL_DATA_WORK_SECTION_ID) {
        return {
          ...defaultSection,
          ...loadedSection,
          title: defaultSection.title ?? loadedSection.title,
          fields: mergePresetFieldsPreservingOrder({
            loadedFields: loadedSection.fields,
            presetFieldsById: new Map(defaultSection.fields.map((field) => [field.id, field])),
            presetFieldOrder: defaultSection.fields,
            includeMissingPresets: false,
            mergeField: mergePersonalDataWorkPresetField,
          }),
        };
      }

      return {
        ...defaultSection,
        ...loadedSection,
      };
    },
  });
}

function mergePassportPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      deletable: false,
      editableLabel: false,
      required: false,
    },
    messages,
  );
}

function mergePassportPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("passport", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllPassportPresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => ({
      ...defaultSection,
      ...loadedSection,
      fields: mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: includeEmptyFields,
        mergeField: (presetField, loadedField) => mergePassportPresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      }),
    }),
  });
}

function mergeSecureFilesPresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      editableLabel: true,
      required: false,
    },
    messages,
  );
}

function mergeSecureFilesPresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("secure_files", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllSecureFilesPresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: loaded,
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => {
      const fields = mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: includeEmptyFields,
        mergeField: (presetField, loadedField) => mergeSecureFilesPresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      });
      const canDeleteFields = fields.length > 1;

      return {
        ...defaultSection,
        ...loadedSection,
        fields: fields.map((field) => ({
          ...field,
          deletable: canDeleteFields,
        })),
      };
    },
  });
}

function mergeSecureNotePresetField(
  presetField: KeyFormEditorField,
  loadedField: KeyFormEditorField,
  messages: KeyFormEditorMessages,
): KeyFormEditorField {
  return enrichCategoryPresetSelectField(
    {
      ...presetField,
      ...loadedField,
      type: "multiline-text",
      editableLabel: true,
      required: false,
    },
    messages,
  );
}

function normalizeSecureNoteLoadedSections(loaded: KeyFormEditorSection[]): KeyFormEditorSection[] {
  return loaded.map((section) => {
    if (section.id !== "s-note-body") {
      return section;
    }

    return {
      ...section,
      id: SECURE_NOTE_SECTION_ID,
      fields: section.fields.map((field) =>
        field.id === "f-note-body" ? { ...field, id: "note", type: "multiline-text" } : field,
      ),
    };
  });
}

function mergeSecureNotePresetSections(
  loaded: KeyFormEditorSection[],
  messages: KeyFormEditorMessages,
  includeEmptyFields: boolean,
): KeyFormEditorSection[] {
  const defaults = getDefaultSectionsForCategory("secure_note", messages);
  const defaultSection = defaults[0];
  if (!defaultSection) {
    return loaded;
  }

  const allPresetFields = getAllSecureNotePresetFields(messages);
  const presetFieldsById = new Map(allPresetFields.map((field) => [field.id, field]));

  return mergePresetSectionsPreservingOrder({
    loadedSections: normalizeSecureNoteLoadedSections(loaded),
    defaultSections: defaults,
    includeMissingSections: includeEmptyFields,
    mergeSection: (defaultSection, loadedSection) => {
      const fields = mergePresetFieldsPreservingOrder({
        loadedFields: loadedSection.fields,
        presetFieldsById,
        presetFieldOrder: allPresetFields,
        includeMissingPresets: includeEmptyFields,
        mergeField: (presetField, loadedField) => mergeSecureNotePresetField(presetField, loadedField, messages),
        enrichCustomField: (field) => enrichCategoryPresetSelectField(field, messages),
      });
      const canDeleteFields = fields.length > 1;

      return {
        ...defaultSection,
        ...loadedSection,
        fields: fields.map((field) => ({
          ...field,
          deletable: canDeleteFields,
        })),
      };
    },
  });
}

function toFormField(
  field: ItemFieldV2,
  sectionId: string,
  sectionFields: ItemFieldV2[],
  isPresetSection: boolean,
  messages?: KeyFormEditorMessages,
): KeyFormEditorField {
  const value = stringValueFromField(field);
  const type = formFieldType(field);
  const deletable = isFieldDeletable(sectionId, field, sectionFields, isPresetSection);
  const secretKind = type === "secret" ? getSecretKindFromRaw(field.value.kind === "unknown" ? field.value.raw : null) : undefined;
  const selectField = type === "select" ? parseSelectFieldValueFromItem(field) : undefined;
  const editableLabel = isFieldLabelEditable(sectionId, field, isPresetSection);
  const formField: KeyFormEditorField = {
    id: field.id,
    type,
    label: messages
      ? resolveKeyFormFieldLabel(
          { id: field.id, type, label: field.label, editableLabel },
          messages,
          { sectionId },
        )
      : field.label ?? field.id,
    value: selectField?.value ?? value,
    copyValue: type === "password" || type === "secret" || type === "url" ? value : undefined,
    secret: type === "password" || type === "secret",
    editableLabel,
    deletable,
    required: isFieldRequired(sectionId, field, sectionFields, isPresetSection),
    ...(secretKind ? { secretKind } : {}),
    ...(type === "url" ? { urlAutofillScope: "entire-site" as const } : {}),
    ...(type === "multiline-text" && field.value.kind === "note" && field.value.disableClickCopy
      ? { disableClickCopy: true }
      : {}),
    ...(selectField?.selectOptions ? { selectOptions: selectField.selectOptions } : {}),
  };

  return messages ? enrichCategoryPresetSelectField(formField, messages) : formField;
}

export type ItemPlaintextToKeyFormSectionsOptions = {
  /** When true, empty fields are included (edit/copy). Card view omits this. */
  includeEmptyFields?: boolean;
};

export function itemPlaintextToKeyFormSections(
  item: ItemPlaintextV2,
  messages?: KeyFormEditorMessages,
  options?: ItemPlaintextToKeyFormSectionsOptions,
): KeyFormEditorSection[] {
  const includeEmptyFields = options?.includeEmptyFields ?? false;
  const sectionsById = new Map(item.sections.map((section) => [section.id, section]));
  const orderedSectionIds = [...item.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => section.id)
    .filter((sectionId, index, sectionIds) => sectionIds.indexOf(sectionId) === index);

  const fieldsBySection = new Map<string, ItemFieldV2[]>();
  const seenFieldIdsBySection = new Map<string, Set<string>>();
  for (const field of item.fields) {
    if (!includeEmptyFields && !isItemFieldFilled(field)) {
      continue;
    }
    const seenFieldIds = seenFieldIdsBySection.get(field.sectionId) ?? new Set<string>();
    if (seenFieldIds.has(field.id)) {
      continue;
    }
    seenFieldIds.add(field.id);
    seenFieldIdsBySection.set(field.sectionId, seenFieldIds);
    const bucket = fieldsBySection.get(field.sectionId) ?? [];
    bucket.push(field);
    fieldsBySection.set(field.sectionId, bucket);
  }

  let sections: KeyFormEditorSection[] = orderedSectionIds
    .map((sectionId): KeyFormEditorSection | null => {
      const section = sectionsById.get(sectionId);
      const sectionFields = (fieldsBySection.get(sectionId) ?? []).sort((a, b) => a.order - b.order);
      if (sectionFields.length === 0) {
        return null;
      }
      const isPresetSection = Boolean(section?.isPreset);
      const fields = sectionFields.map((field) => toFormField(field, sectionId, sectionFields, isPresetSection, messages));
      return {
        id: sectionId,
        variant: section?.isPreset ? "primary" : "additional",
        title: sectionTitleForForm(section),
        fields,
      } satisfies KeyFormEditorSection;
    })
    .filter((section): section is KeyFormEditorSection => section !== null);

  if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "login") {
    sections = mergeLoginPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "api_access") {
    sections = mergeApiAccessPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "database") {
    sections = mergeDatabasePresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "server") {
    sections = mergeServerPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "bank_account") {
    sections = mergeBankAccountPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "crypto_wallet") {
    sections = mergeCryptoWalletPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "wifi_router") {
    sections = mergeWifiRouterPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "credit_card") {
    sections = mergeCreditCardPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "personal_data") {
    sections = mergePersonalDataPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "passport") {
    sections = mergePassportPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "secure_files") {
    sections = mergeSecureFilesPresetSections(sections, messages, includeEmptyFields);
  } else if (messages && isItemCategoryId(item.categoryId) && item.categoryId === "secure_note") {
    sections = mergeSecureNotePresetSections(sections, messages, includeEmptyFields);
  }

  if (!includeEmptyFields) {
    return filterFilledKeyFormSections(sections);
  }

  return sections;
}
