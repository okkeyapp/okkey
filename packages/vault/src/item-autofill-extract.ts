import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import {
  formatKeyFieldAddressCopyValue,
  parseKeyFieldAddressValue,
} from "@okkey/ui/lib/key-field-address";

/** Semantic autofill keys shared with the extension content script. */
export type AutofillValueKey =
  | "username"
  | "password"
  | "email"
  | "given-name"
  | "family-name"
  | "additional-name"
  | "name"
  | "tel"
  | "bday"
  | "sex"
  | "organization"
  | "organization-title"
  | "address"
  | "street-address"
  | "address-house"
  | "address-apartment"
  | "address-level1"
  | "address-level2"
  | "postal-code"
  | "country"
  | "cc-number"
  | "cc-exp"
  | "cc-csc"
  | "cc-name"
  | "bank-name"
  | "bank-account-holder"
  | "bank-account-number"
  | "iban"
  | "swift"
  | "passport-number"
  | "passport-type"
  | "nationality"
  | "issuing-authority"
  | "birth-place"
  | "passport-issue"
  | "passport-expiry"
  | "db-server"
  | "db-port"
  | "db-name"
  | "db-username"
  | "db-password"
  | "db-sid"
  | "crypto-address"
  | "crypto-pin"
  | "crypto-passphrase";

export const AUTOFILL_ITEM_CATEGORIES = [
  "login",
  "personal_data",
  "credit_card",
  "bank_account",
  "passport",
  "database",
  "crypto_wallet",
] as const;

export type AutofillItemCategory = (typeof AUTOFILL_ITEM_CATEGORIES)[number];

const FIELD_ID_TO_KEY: Record<string, AutofillValueKey> = {
  login: "username",
  password: "password",
  email: "email",
  "work-email": "email",
  nickname: "username",
  "first-name": "given-name",
  "last-name": "family-name",
  "middle-name": "additional-name",
  "full-name": "name",
  phone: "tel",
  "work-phone": "tel",
  "birth-date": "bday",
  gender: "sex",
  "work-company": "organization",
  "work-position": "organization-title",
  "card-number": "cc-number",
  "card-expiry": "cc-exp",
  "card-pin": "cc-csc",
  "card-holder": "cc-name",
  "bank-name": "bank-name",
  "bank-account-holder": "bank-account-holder",
  "bank-account-number": "bank-account-number",
  "bank-iban": "iban",
  "bank-swift": "swift",
  "bank-address": "street-address",
  "bank-phone": "tel",
  "passport-number": "passport-number",
  "passport-type": "passport-type",
  nationality: "nationality",
  "issuing-country": "country",
  "issuing-authority": "issuing-authority",
  "birth-place": "birth-place",
  "issue-date": "passport-issue",
  "expiry-date": "passport-expiry",
  "db-server": "db-server",
  "db-port": "db-port",
  "db-database": "db-name",
  "db-username": "db-username",
  "db-password": "db-password",
  "db-sid": "db-sid",
  "crypto-wallet-address": "crypto-address",
  "crypto-access-pin": "crypto-pin",
  "crypto-passphrase": "crypto-passphrase",
};

const LOGIN_KEYS = new Set<string>(["username", "password", "otp", "email"]);
const PERSONAL_KEYS = new Set<string>([
  "email",
  "username",
  "given-name",
  "family-name",
  "additional-name",
  "name",
  "tel",
  "bday",
  "sex",
  "organization",
  "organization-title",
]);
const ADDRESS_KEYS = new Set<string>([
  "address",
  "street-address",
  "address-house",
  "address-apartment",
  "address-level1",
  "address-level2",
  "postal-code",
  "country",
]);
const CC_KEYS = new Set<string>(["cc-number", "cc-exp", "cc-csc", "cc-name"]);
const BANK_KEYS = new Set<string>([
  "bank-name",
  "bank-account-holder",
  "bank-account-number",
  "iban",
  "swift",
]);
const PASSPORT_KEYS = new Set<string>([
  "passport-number",
  "passport-type",
  "nationality",
  "issuing-authority",
  "birth-place",
  "passport-issue",
  "passport-expiry",
  "name",
  "sex",
  "bday",
  "country",
]);
const DATABASE_KEYS = new Set<string>([
  "db-server",
  "db-port",
  "db-name",
  "db-username",
  "db-password",
  "db-sid",
]);
const CRYPTO_KEYS = new Set<string>(["crypto-address", "crypto-pin", "crypto-passphrase"]);

function selectValueFromRaw(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }
  const value = (raw as { value?: unknown }).value;
  return typeof value === "string" ? value.trim() : "";
}

function secretValueFromRaw(raw: unknown): string {
  if (typeof raw === "string") {
    try {
      return secretValueFromRaw(JSON.parse(raw));
    } catch {
      return raw.trim();
    }
  }
  if (!raw || typeof raw !== "object") {
    return "";
  }
  const value = (raw as { value?: unknown }).value;
  return typeof value === "string" ? value.trim() : "";
}

function fieldPlainString(field: ItemFieldV2): string {
  switch (field.value.kind) {
    case "text":
      return field.value.text.trim();
    case "password":
      return field.value.password;
    case "url":
      return field.value.url.trim();
    case "note":
      return field.value.note.trim();
    case "unknown": {
      if (field.value.declaredType === "secret") {
        return secretValueFromRaw(field.value.raw);
      }
      if (field.value.declaredType === "select") {
        return selectValueFromRaw(field.value.raw);
      }
      if (field.value.declaredType === "address" && typeof field.value.raw === "string") {
        return field.value.raw.trim();
      }
      if (typeof field.value.raw === "string") {
        return field.value.raw.trim();
      }
      return "";
    }
    default:
      return "";
  }
}

function put(map: Partial<Record<AutofillValueKey, string>>, key: AutofillValueKey, value: string): void {
  const trimmed = value.trim();
  if (!trimmed || map[key]) {
    return;
  }
  map[key] = trimmed;
}

function expandAddressField(
  map: Partial<Record<AutofillValueKey, string>>,
  raw: string,
  locale = "en",
): void {
  const address = parseKeyFieldAddressValue(raw);
  put(map, "street-address", address.street);
  put(map, "address-house", address.house);
  put(map, "address-apartment", address.apartment);
  put(map, "address-level2", address.city);
  put(map, "address-level1", address.state);
  put(map, "postal-code", address.postalCode);
  put(map, "country", address.country);
  const formatted = formatKeyFieldAddressCopyValue(address, locale);
  if (formatted) {
    put(map, "address", formatted);
  }
}

function looksLikeEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) {
    return false;
  }
  // Practical check — vault UI email fields already validate more strictly.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function fieldLabelSuggestsEmail(label: string | undefined): boolean {
  if (!label) {
    return false;
  }
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("email") ||
    normalized.includes("e-mail") ||
    normalized.includes("emeil") ||
    normalized.includes("mail") ||
    normalized.includes("почт") ||
    normalized.includes("электрон")
  );
}

/**
 * All distinct email values on an item: preset email / work-email plus custom
 * fields with type email (or email-like label + address-shaped value).
 */
export function extractAutofillEmailCandidates(item: ItemPlaintextV2): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const value = raw.trim();
    if (!value || seen.has(value.toLowerCase())) {
      return;
    }
    if (!looksLikeEmailAddress(value)) {
      return;
    }
    seen.add(value.toLowerCase());
    out.push(value);
  };

  for (const field of item.fields) {
    const text = fieldPlainString(field);
    if (!text) {
      continue;
    }
    const mapped = FIELD_ID_TO_KEY[field.id];
    if (mapped === "email" || field.id === "email" || field.id === "work-email") {
      push(text);
      continue;
    }
    if (field.type === "email") {
      push(text);
      continue;
    }
    if (fieldLabelSuggestsEmail(field.label) && looksLikeEmailAddress(text)) {
      push(text);
    }
  }
  return out;
}

export type ExtractAutofillValuesOptions = {
  /** BCP 47 locale for one-line address formatting (page or vault UI locale). */
  locale?: string;
};

/** Extract semantic fill values from any supported vault item category. */
export function extractAutofillValues(
  item: ItemPlaintextV2,
  options?: ExtractAutofillValuesOptions,
): Partial<Record<AutofillValueKey, string>> {
  const map: Partial<Record<AutofillValueKey, string>> = {};
  const locale = options?.locale?.trim() || "en";

  for (const field of item.fields) {
    if (field.id === "address" || field.type === "address") {
      const raw =
        field.value.kind === "unknown" && typeof field.value.raw === "string"
          ? field.value.raw
          : field.value.kind === "text"
            ? field.value.text
            : "";
      if (raw) {
        expandAddressField(map, raw, locale);
      }
      continue;
    }

    const key = FIELD_ID_TO_KEY[field.id];
    if (key) {
      put(map, key, fieldPlainString(field));
      continue;
    }

    // Custom email fields (user-added) — first wins in the flat map; full list
    // via {@link extractAutofillEmailCandidates}.
    if (field.type === "email" || fieldLabelSuggestsEmail(field.label)) {
      const text = fieldPlainString(field);
      if (looksLikeEmailAddress(text)) {
        put(map, "email", text);
      }
    }
  }

  if (!map.name) {
    const parts = [map["given-name"], map["additional-name"], map["family-name"]].filter(Boolean);
    if (parts.length > 0) {
      map.name = parts.join(" ");
    }
  }

  return map;
}

function valueForFocusedKind(
  values: Partial<Record<AutofillValueKey, string>>,
  focusedKind: string | null | undefined,
): string {
  if (!focusedKind) {
    return "";
  }
  const direct = values[focusedKind as AutofillValueKey];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  if (focusedKind === "username") {
    return values.username || values.email || "";
  }
  if (focusedKind === "email") {
    return values.email || "";
  }
  if (focusedKind === "name") {
    return (
      values.name ||
      [values["given-name"], values["additional-name"], values["family-name"]].filter(Boolean).join(" ")
    );
  }
  if (focusedKind === "address" || focusedKind === "street-address") {
    return values.address || values["street-address"] || "";
  }
  return "";
}

/**
 * Subtitle under a suggestion title. For personal_data, prefer the value that
 * matches the focused page field (e.g. given-name → first name).
 */
export function suggestionSubtitleFromValues(
  categoryId: string,
  values: Partial<Record<AutofillValueKey, string>>,
  focusedKind?: string | null,
): string {
  if (categoryId === "login") {
    return values.username || values.email || "";
  }
  if (categoryId === "credit_card") {
    const number = values["cc-number"] ?? "";
    const digits = number.replace(/\D/g, "");
    if (digits.length >= 4) {
      return `•••• ${digits.slice(-4)}`;
    }
    return values["cc-name"] || "";
  }
  if (categoryId === "personal_data") {
    const fromFocus = valueForFocusedKind(values, focusedKind);
    if (fromFocus) {
      return fromFocus;
    }
    return values.email || values.username || values.name || values.tel || "";
  }
  if (categoryId === "bank_account") {
    return values.iban || values["bank-account-number"] || values["bank-name"] || "";
  }
  if (categoryId === "passport") {
    return values["passport-number"] || values.name || "";
  }
  if (categoryId === "database") {
    return values["db-username"] || values["db-name"] || values["db-server"] || "";
  }
  if (categoryId === "crypto_wallet") {
    const addr = values["crypto-address"] ?? "";
    if (addr.length > 12) {
      return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    }
    return addr;
  }
  return values.email || values.username || "";
}

/**
 * Map detected field kinds → vault categories that can fill them.
 *
 * Only the primary (first) kind is used. Callers put the focused field kind
 * first; sibling fields on the same page must not widen suggestions (e.g. an
 * email input next to cardNumber must never surface credit_card / bank items).
 */
export function categoriesForFieldKinds(kinds: readonly string[]): AutofillItemCategory[] {
  const out = new Set<AutofillItemCategory>();
  const primary = kinds.length > 0 ? [kinds[0]!] : kinds;
  for (const kind of primary) {
    if (LOGIN_KEYS.has(kind)) {
      out.add("login");
    }
    if (PERSONAL_KEYS.has(kind)) {
      out.add("personal_data");
    }
    if (ADDRESS_KEYS.has(kind)) {
      out.add("personal_data");
    }
    if (CC_KEYS.has(kind)) {
      out.add("credit_card");
    }
    if (BANK_KEYS.has(kind)) {
      out.add("bank_account");
    }
    if (PASSPORT_KEYS.has(kind)) {
      out.add("passport");
    }
    if (DATABASE_KEYS.has(kind)) {
      out.add("database");
    }
    if (CRYPTO_KEYS.has(kind)) {
      out.add("crypto_wallet");
    }
  }
  if (out.size === 0) {
    out.add("login");
  }
  return AUTOFILL_ITEM_CATEGORIES.filter((id) => out.has(id));
}

export function isAutofillItemCategory(categoryId: string): categoryId is AutofillItemCategory {
  return (AUTOFILL_ITEM_CATEGORIES as readonly string[]).includes(categoryId);
}
