import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";

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
  | "street-address"
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
  "street-address",
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

type AddressParts = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function parseAddressRaw(raw: string): AddressParts {
  const empty: AddressParts = { street: "", city: "", state: "", postalCode: "", country: "" };
  const trimmed = raw.trim();
  if (!trimmed) {
    return empty;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return empty;
    }
    const record = parsed as Partial<Record<keyof AddressParts, unknown>>;
    return {
      street: typeof record.street === "string" ? record.street : "",
      city: typeof record.city === "string" ? record.city : "",
      state: typeof record.state === "string" ? record.state : "",
      postalCode: typeof record.postalCode === "string" ? record.postalCode : "",
      country: typeof record.country === "string" ? record.country : "",
    };
  } catch {
    return empty;
  }
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

function expandAddressField(map: Partial<Record<AutofillValueKey, string>>, raw: string): void {
  const address = parseAddressRaw(raw);
  put(map, "street-address", address.street);
  put(map, "address-level2", address.city);
  put(map, "address-level1", address.state);
  put(map, "postal-code", address.postalCode);
  put(map, "country", address.country);
}

/** Extract semantic fill values from any supported vault item category. */
export function extractAutofillValues(item: ItemPlaintextV2): Partial<Record<AutofillValueKey, string>> {
  const map: Partial<Record<AutofillValueKey, string>> = {};

  for (const field of item.fields) {
    if (field.id === "address" || field.type === "address") {
      const raw =
        field.value.kind === "unknown" && typeof field.value.raw === "string"
          ? field.value.raw
          : field.value.kind === "text"
            ? field.value.text
            : "";
      if (raw) {
        expandAddressField(map, raw);
      }
      continue;
    }

    const key = FIELD_ID_TO_KEY[field.id];
    if (!key) {
      continue;
    }
    put(map, key, fieldPlainString(field));
  }

  if (!map.name) {
    const parts = [map["given-name"], map["additional-name"], map["family-name"]].filter(Boolean);
    if (parts.length > 0) {
      map.name = parts.join(" ");
    }
  }

  return map;
}

export function suggestionSubtitleFromValues(
  categoryId: string,
  values: Partial<Record<AutofillValueKey, string>>,
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
    return values.email || values.name || values.tel || "";
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

/** Map detected page field kinds → vault categories that can fill them. */
export function categoriesForFieldKinds(kinds: readonly string[]): AutofillItemCategory[] {
  const out = new Set<AutofillItemCategory>();
  for (const kind of kinds) {
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
