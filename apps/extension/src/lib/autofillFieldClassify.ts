/** Semantic kinds for page input classification (aligned with vault extract keys + login/otp). */
export type AutofillFieldKind =
  | "username"
  | "password"
  | "otp"
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

export type AutofillInputHints = {
  type: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  labelText?: string;
  inputMode?: string;
  maxLength?: number;
  role?: string;
};

const OTP_NAME =
  /one[-_]?time|otp|totp|2fa|mfa|authenticator|verification[-_]?code|auth[-_]?code|^code$/i;

/** Fields that must never receive autofill / Okkey toggle. */
const DENYLIST_HINT =
  /\b(search|filter|query|find|look[-_]?up|комментар|comment|message|chat|captcha|recaptcha|csrf|token(?![-_]?auth)|honeypot|website[-_]?url|promo[-_]?code|coupon|newsletter|subscribe)\b/i;

const SEARCH_HINT = /\b(search|найти|поиск|искать|filter|фильтр)\b/i;

/** Email / mail heuristics (EN + RU + common variants). */
const EMAIL_HINT =
  /e[-_.\s]?mail|emailaddress|mail(addr|to)?|user[-_]?mail|эл\.?\s*почт|электронн[а-яёa-z]*\s*почт|почт[аеуы]?|е[-]?мейл|имейл|courriel/i;

const USER_NAME =
  /user(name)?|login|account|identifier|userid|user[-_]?id|nickname|логин|пользовател|учётн|учетн/i;

const GIVEN_NAME = /given[-_]?name|first[-_]?name|fname|forename|имя(?!\s*пользовател)|имя\b/i;
const FAMILY_NAME = /family[-_]?name|last[-_]?name|surname|lname|фамил/i;
const ADDITIONAL_NAME = /additional[-_]?name|middle[-_]?name|отчеств/i;
const FULL_NAME = /^(full[-_]?name|displayname|display[-_]?name|имя\s*и\s*фамил)|card[-_]?holder|holder[-_]?name|account[-_]?holder/i;
const TEL_HINT = /\b(phone|mobile|tel|cellphone|телефон|мобил)/i;
const BDAY_HINT = /bday|birth[-_]?date|date[-_]?of[-_]?birth|\bdob\b|дата\s*рожд/i;
const SEX_HINT = /\bsex\b|\bgender\b|пол\b/i;
const ORG_HINT = /organization|company|employer|компани|организац/i;
const ORG_TITLE = /organization[-_]?title|job[-_]?title|position|title|должност|позици/i;

const STREET =
  /\b(street|address[-_]?line\d?|address\d?|addr\d?)\b|улиц|(?<!электронн\S*\s)(?<!эл\.?\s)адрес(?!\s*кошель)/i;
const CITY = /address[-_]?level[-_]?2|\bcity\b|\btown\b|suburb|город/i;
const STATE = /address[-_]?level[-_]?1|\bstate\b|province|region|област|регион|край/i;
const POSTAL = /postal|zip|postcode|индекс/i;
const COUNTRY = /\bcountry\b|стран[аы]|nationality|гражданств|issuing[-_]?country/i;

const CC_NUMBER = /cc[-_]?number|card[-_]?number|cardnumber|pan\b|номер\s*карт/i;
const CC_EXP = /cc[-_]?exp|expir|card[-_]?exp|срок\s*действ|месяц.*год|mm\s*\/?\s*yy/i;
const CC_CSC = /cc[-_]?csc|cc[-_]?cvv|cvc|cvv|security[-_]?code|код\s*безопас/i;
const CC_NAME = /cc[-_]?name|card[-_]?holder|cardholder|имя\s*владельц|держател/i;

const IBAN = /\biban\b/i;
const SWIFT = /swift|bic\b/i;
const BANK_ACCOUNT = /account[-_]?number|bank[-_]?account|расчётн|расчетн|номер\s*сч[её]т/i;
const BANK_NAME = /bank[-_]?name|название\s*банк|банк\b/i;
const BANK_HOLDER = /account[-_]?holder|beneficiary|получател|владел.*сч/i;

const PASSPORT_NUMBER = /passport[-_]?number|passport[-_]?no|номер\s*паспорт|серия.*номер/i;
const PASSPORT_TYPE = /passport[-_]?type|тип\s*паспорт/i;
const NATIONALITY = /nationality|гражданств/i;
const ISSUING_AUTH = /issuing[-_]?authority|орган.*выдав|кем\s*выдан/i;
const BIRTH_PLACE = /birth[-_]?place|place[-_]?of[-_]?birth|место\s*рожд/i;
const PASSPORT_ISSUE = /issue[-_]?date|date[-_]?of[-_]?issue|дата\s*выдач/i;
const PASSPORT_EXPIRY = /passport[-_]?exp|expiry[-_]?date|date[-_]?of[-_]?expiry|срок\s*действ.*паспорт|годен\s*до/i;

const DB_SERVER = /db[-_]?host|db[-_]?server|hostname|host\b|сервер/i;
const DB_PORT = /db[-_]?port|port\b|порт/i;
const DB_NAME = /db[-_]?name|database|база\s*данных/i;
const DB_USER = /db[-_]?user|db[-_]?login|db[-_]?username/i;
const DB_PASS = /db[-_]?pass|db[-_]?password/i;
const DB_SID = /\bsid\b|service[-_]?name/i;

const CRYPTO_ADDR = /wallet[-_]?address|crypto[-_]?address|btc|eth[-_]?address|адрес\s*кошель/i;
const CRYPTO_PIN = /crypto[-_]?pin|access[-_]?pin|wallet[-_]?pin/i;
const CRYPTO_PHRASE = /passphrase|seed[-_]?phrase|mnemonic|сид[-_]?фраз|мнемоник/i;

export function attrBlob(el: AutofillInputHints): string {
  return [el.name, el.id, el.autocomplete, el.placeholder, el.ariaLabel, el.labelText]
    .filter(Boolean)
    .join(" ");
}

function acToken(ac: string, token: string): boolean {
  return ac.split(/\s+/).some((part) => {
    const p = part.toLowerCase();
    return p === token || p.endsWith(`-${token}`) || p.startsWith(`${token}-`);
  });
}

function firstMatch(
  blob: string,
  ac: string,
  rules: Array<{ key: AutofillFieldKind; ac?: string | string[]; re: RegExp }>,
): AutofillFieldKind | null {
  for (const rule of rules) {
    if (rule.ac) {
      const tokens = Array.isArray(rule.ac) ? rule.ac : [rule.ac];
      if (tokens.some((t) => acToken(ac, t))) {
        return rule.key;
      }
    }
    if (rule.re.test(blob)) {
      return rule.key;
    }
  }
  return null;
}

/**
 * True when the field must not show Okkey autofill UI / receive fills
 * (search, filter, captcha, comments, non-text controls, etc.).
 */
export function isDeniedAutofillField(input: AutofillInputHints): boolean {
  const type = (input.type || "text").toLowerCase();
  if (
    type === "hidden" ||
    type === "submit" ||
    type === "button" ||
    type === "checkbox" ||
    type === "radio" ||
    type === "file" ||
    type === "image" ||
    type === "reset" ||
    type === "range" ||
    type === "color" ||
    type === "search"
  ) {
    return true;
  }

  const ac = (input.autocomplete ?? "").toLowerCase().trim();
  if (acToken(ac, "search") || ac.split(/\s+/).some((part) => part === "search" || part.endsWith("-search"))) {
    return true;
  }

  const blob = attrBlob(input);
  const role = input.role?.toLowerCase();
  if (role === "searchbox" || role === "switch" || role === "checkbox" || role === "radio") {
    return true;
  }
  if (SEARCH_HINT.test(blob) || DENYLIST_HINT.test(blob)) {
    // Allow real identity fields that only mention deny-words inside a longer unrelated phrase
    // via explicit email/username/password autocomplete.
    if (
      acToken(ac, "email") ||
      acToken(ac, "username") ||
      acToken(ac, "current-password") ||
      acToken(ac, "new-password") ||
      ac.includes("one-time")
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Classify a page input for autofill (login + personal / finance / docs / db / crypto).
 * Returns null when the field is not a known autofill target.
 */
export function classifyAutofillInput(input: AutofillInputHints): AutofillFieldKind | null {
  const type = (input.type || "text").toLowerCase();
  const ac = (input.autocomplete ?? "").toLowerCase().trim();
  const blob = attrBlob(input);

  if (isDeniedAutofillField(input)) {
    return null;
  }

  if (type === "password") {
    // OTP often uses type=password on multi-box / one-time fields — never treat as password.
    if (ac.includes("one-time") || ac === "one-time-code" || OTP_NAME.test(blob)) {
      return "otp";
    }
    // Single-digit password boxes are almost always OTP digit groups, not a password field.
    if (input.maxLength === 1 && (input.inputMode === "numeric" || input.inputMode === "decimal")) {
      return "otp";
    }
    if (DB_PASS.test(blob)) {
      return "db-password";
    }
    if (CRYPTO_PHRASE.test(blob) || CRYPTO_PIN.test(blob)) {
      return CRYPTO_PHRASE.test(blob) ? "crypto-passphrase" : "crypto-pin";
    }
    return "password";
  }

  if (
    ac.includes("one-time-code") ||
    ac.includes("one-time") ||
    ac === "otp" ||
    OTP_NAME.test(blob) ||
    (input.inputMode === "numeric" &&
      (input.maxLength === 6 || input.maxLength === 8) &&
      OTP_NAME.test(blob))
  ) {
    return "otp";
  }

  const crypto = firstMatch(blob, ac, [
    { key: "crypto-address", ac: undefined, re: CRYPTO_ADDR },
    { key: "crypto-passphrase", ac: undefined, re: CRYPTO_PHRASE },
    { key: "crypto-pin", ac: undefined, re: CRYPTO_PIN },
  ]);
  if (crypto) {
    return crypto;
  }

  // Email before address: labels like "Email address" must not become street-address.
  if (
    type === "email" ||
    input.inputMode === "email" ||
    acToken(ac, "email") ||
    ac.includes("email") ||
    EMAIL_HINT.test(blob)
  ) {
    return "email";
  }

  const cc = firstMatch(blob, ac, [
    { key: "cc-number", ac: "cc-number", re: CC_NUMBER },
    { key: "cc-exp", ac: ["cc-exp", "cc-exp-month", "cc-exp-year"], re: CC_EXP },
    { key: "cc-csc", ac: "cc-csc", re: CC_CSC },
    { key: "cc-name", ac: "cc-name", re: CC_NAME },
  ]);
  if (cc) {
    return cc;
  }

  const address = firstMatch(blob, ac, [
    { key: "street-address", ac: ["street-address", "address-line1", "address-line2"], re: STREET },
    { key: "address-level2", ac: "address-level2", re: CITY },
    { key: "address-level1", ac: "address-level1", re: STATE },
    { key: "postal-code", ac: "postal-code", re: POSTAL },
    { key: "country", ac: ["country", "country-name"], re: COUNTRY },
  ]);
  if (address) {
    return address;
  }

  const bank = firstMatch(blob, ac, [
    { key: "iban", ac: undefined, re: IBAN },
    { key: "swift", ac: undefined, re: SWIFT },
    { key: "bank-account-number", ac: undefined, re: BANK_ACCOUNT },
    { key: "bank-account-holder", ac: undefined, re: BANK_HOLDER },
    { key: "bank-name", ac: undefined, re: BANK_NAME },
  ]);
  if (bank) {
    return bank;
  }

  const passport = firstMatch(blob, ac, [
    { key: "passport-number", ac: undefined, re: PASSPORT_NUMBER },
    { key: "passport-type", ac: undefined, re: PASSPORT_TYPE },
    { key: "nationality", ac: undefined, re: NATIONALITY },
    { key: "issuing-authority", ac: undefined, re: ISSUING_AUTH },
    { key: "birth-place", ac: undefined, re: BIRTH_PLACE },
    { key: "passport-issue", ac: undefined, re: PASSPORT_ISSUE },
    { key: "passport-expiry", ac: undefined, re: PASSPORT_EXPIRY },
  ]);
  if (passport) {
    return passport;
  }

  const db = firstMatch(blob, ac, [
    { key: "db-password", ac: undefined, re: DB_PASS },
    { key: "db-username", ac: undefined, re: DB_USER },
    { key: "db-name", ac: undefined, re: DB_NAME },
    { key: "db-port", ac: undefined, re: DB_PORT },
    { key: "db-server", ac: undefined, re: DB_SERVER },
    { key: "db-sid", ac: undefined, re: DB_SID },
  ]);
  if (db) {
    return db;
  }

  const personal = firstMatch(blob, ac, [
    { key: "given-name", ac: "given-name", re: GIVEN_NAME },
    { key: "family-name", ac: "family-name", re: FAMILY_NAME },
    { key: "additional-name", ac: "additional-name", re: ADDITIONAL_NAME },
    { key: "name", ac: "name", re: FULL_NAME },
    { key: "tel", ac: ["tel", "tel-national", "tel-local"], re: TEL_HINT },
    { key: "bday", ac: ["bday", "bday-day", "bday-month", "bday-year"], re: BDAY_HINT },
    { key: "sex", ac: "sex", re: SEX_HINT },
    { key: "organization", ac: "organization", re: ORG_HINT },
    { key: "organization-title", ac: "organization-title", re: ORG_TITLE },
  ]);
  if (personal) {
    return personal;
  }

  if (acToken(ac, "username") || ac.includes("username") || USER_NAME.test(blob)) {
    return "username";
  }

  if (type === "tel" && TEL_HINT.test(blob)) {
    return "tel";
  }

  return null;
}

/** Login-oriented classification (email → username for fill buckets). */
export function classifyLoginInput(input: AutofillInputHints): "username" | "password" | "otp" | null {
  const kind = classifyAutofillInput(input);
  if (kind === "password" || kind === "otp") {
    return kind;
  }
  if (kind === "username" || kind === "email" || kind === "db-username") {
    return "username";
  }
  return null;
}

export function collectInputHints(el: HTMLInputElement): AutofillInputHints {
  let labelText = "";
  try {
    if (el.labels && el.labels.length > 0) {
      labelText = Array.from(el.labels)
        .map((label) => label.textContent ?? "")
        .join(" ");
    }
  } catch {
    /* labels may throw in odd DOM */
  }
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const extra = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    labelText = `${labelText} ${extra}`.trim();
  }
  return {
    type: el.type,
    name: el.name,
    id: el.id,
    autocomplete: el.autocomplete,
    placeholder: el.placeholder,
    ariaLabel: el.getAttribute("aria-label") ?? undefined,
    labelText: labelText || undefined,
    inputMode: el.inputMode,
    maxLength: el.maxLength,
    role: el.getAttribute("role") ?? undefined,
  };
}

export function collectPageFieldKinds(root: ParentNode): AutofillFieldKind[] {
  const kinds = new Set<AutofillFieldKind>();
  const nodes = Array.from(root.querySelectorAll("input"));
  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement)) {
      continue;
    }
    const kind = classifyAutofillInput(collectInputHints(node));
    if (kind) {
      kinds.add(kind);
    }
  }
  return [...kinds];
}

/**
 * Field kinds sent to the autofill suggestion query.
 * When a field is focused, only that field's kind is used so sibling inputs
 * (e.g. cardNumber next to email on checkout) cannot mix suggestion types.
 */
export function suggestionFieldKindsForFocus(
  focusedKind: AutofillFieldKind | null | undefined,
  pageKinds: readonly AutofillFieldKind[],
): AutofillFieldKind[] {
  if (focusedKind) {
    return [focusedKind];
  }
  return [...pageKinds];
}
