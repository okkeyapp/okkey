import { WEB_LOCALES } from "@okkey/i18n";

import {
  PASSPORT_SECTION_ID,
  PERSONAL_DATA_SECTION_ID,
} from "../items/itemCategoryDefaultSections.js";
import { createKeyFormEditorMessages, type KeyFormEditorMessages } from "./keyFormI18n.js";

const PRESET_FIELD_LABEL_KEYS: Record<string, string> = {
  login: "login",
  password: "password",
  "api-type": "apiType",
  "api-filename": "apiFilename",
  "api-valid-from": "apiValidFrom",
  "api-valid-to": "apiValidTo",
  "api-hostname": "apiHostname",
  "api-name": "apiName",
  "api-credentials": "apiCredentials",
  "db-type": "dbType",
  "db-server": "dbServer",
  "db-port": "dbPort",
  "db-database": "dbDatabase",
  "db-username": "dbUsername",
  "db-password": "dbPassword",
  "db-sid": "dbSid",
  "db-alias": "dbAlias",
  "db-connection-params": "dbConnectionParams",
  "server-url": "serverUrl",
  "server-login": "serverLogin",
  "server-password": "serverPassword",
  "admin-console-url": "adminConsoleUrl",
  "admin-console-login": "adminConsoleLogin",
  "admin-console-password": "adminConsolePassword",
  "wifi-station-name": "wifiStationName",
  "wifi-station-password": "wifiStationPassword",
  "wifi-server-ip": "wifiServerIp",
  "wifi-airport-id": "wifiAirportId",
  "wifi-network-name": "wifiNetworkName",
  "wifi-network-security": "wifiNetworkSecurity",
  "wifi-network-password": "wifiNetworkPassword",
  "wifi-connected-storage-password": "wifiConnectedStoragePassword",
  "card-number": "cardNumber",
  "card-expiry": "cardExpiry",
  "card-pin": "cardPin",
  "card-holder": "cardHolder",
  "bank-name": "bankName",
  "bank-account-holder": "bankAccountHolder",
  "bank-account-number": "bankAccountNumber",
  "bank-swift": "bankSwift",
  "bank-iban": "bankIban",
  "bank-address": "bankAddress",
  "bank-phone": "bankPhone",
  "crypto-access-pin": "cryptoAccessPin",
  "crypto-passphrase": "cryptoPassphrase",
  "crypto-wallet-address": "cryptoWalletAddress",
  "first-name": "personalFirstName",
  "last-name": "personalLastName",
  "middle-name": "personalMiddleName",
  initials: "personalInitials",
  "work-company": "personalWorkCompany",
  "work-department": "personalWorkDepartment",
  "work-position": "personalWorkPosition",
  "work-phone": "personalWorkPhone",
  "work-email": "personalWorkEmail",
  "passport-type": "passportType",
  "issuing-country": "passportIssuingCountry",
  "passport-number": "passportNumber",
  "full-name": "passportFullName",
  nationality: "passportNationality",
  "issuing-authority": "passportIssuingAuthority",
  "birth-place": "passportBirthPlace",
  "issue-date": "passportIssueDate",
  "expiry-date": "passportExpiryDate",
  note: "secureNote",
  "secure-file": "file",
};

const SECTION_FIELD_LABEL_KEYS: Record<string, Record<string, string>> = {
  [PERSONAL_DATA_SECTION_ID]: {
    gender: "personalGender",
    "birth-date": "personalBirthDate",
    phone: "personalPhone",
    email: "personalEmail",
    address: "personalAddress",
  },
  [PASSPORT_SECTION_ID]: {
    gender: "passportGender",
    "birth-date": "passportBirthDate",
  },
};

const defaultLabelsByKey = new Map<string, Set<string>>();

function defaultLabelsForKey(labelKey: string): Set<string> {
  const cached = defaultLabelsByKey.get(labelKey);
  if (cached) {
    return cached;
  }

  const labels = new Set<string>();
  for (const locale of WEB_LOCALES) {
    const messages = createKeyFormEditorMessages(locale);
    const label = messages.fieldLabels[labelKey]?.trim();
    if (label) {
      labels.add(label);
    }
  }

  defaultLabelsByKey.set(labelKey, labels);
  return labels;
}

export function keyFormFieldLabelKey(
  field: Pick<{ id: string; type: string }, "id" | "type">,
  sectionId?: string,
): string | null {
  const sectionSpecific = sectionId ? SECTION_FIELD_LABEL_KEYS[sectionId]?.[field.id] : undefined;
  if (sectionSpecific) {
    return sectionSpecific;
  }

  const presetKey = PRESET_FIELD_LABEL_KEYS[field.id];
  if (presetKey) {
    return presetKey;
  }

  if (field.id.startsWith("website-") && field.type === "url") {
    return "url";
  }

  if (field.type === "select") {
    return "select";
  }

  if (field.type in { text: 1, email: 1, phone: 1, address: 1, date: 1, url: 1, "multiline-text": 1, secret: 1, password: 1, totp: 1, "recovery-codes": 1, file: 1, pin: 1, card: 1, "card-expiry": 1 }) {
    return field.type;
  }

  return null;
}

function isSavedDefaultLabel(savedLabel: string, labelKey: string): boolean {
  return defaultLabelsForKey(labelKey).has(savedLabel.trim());
}

export function resolveKeyFormFieldLabel(
  field: Pick<{ id: string; type: string; label?: string }, "id" | "type" | "label"> & {
    editableLabel?: boolean;
  },
  messages: KeyFormEditorMessages,
  options?: { sectionId?: string },
): string {
  const labelKey = keyFormFieldLabelKey(field, options?.sectionId);
  const defaultLabel = labelKey ? messages.fieldLabels[labelKey]?.trim() : undefined;
  const savedLabel = field.label?.trim();

  if (field.editableLabel === false && defaultLabel) {
    return defaultLabel;
  }

  if (!savedLabel) {
    return defaultLabel ?? field.id;
  }

  if (labelKey && isSavedDefaultLabel(savedLabel, labelKey) && defaultLabel) {
    return defaultLabel;
  }

  return savedLabel;
}
