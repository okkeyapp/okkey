/**
 * Autofill field classification via an ordered signal ladder.
 *
 * Ladder (first confident step wins; lower steps never overwrite):
 * 1. SAWF-style `data-form-type`
 * 2. `autocomplete` per WHATWG (tolerating common site mistakes)
 * 3. `type`
 * 4. label / aria
 * 5. name / id / placeholder
 * 6. position / context (optional {@link ClassifyContext})
 *
 * Cards and addresses use the same ladder. No ML. Dictionaries are owned EN+RU.
 */

import {
  ADDITIONAL_NAME,
  ADDRESS_FULL,
  APARTMENT,
  BACKUP_RECOVERY_CODE_HINT,
  BANK_ACCOUNT,
  BANK_HOLDER,
  BANK_NAME,
  BARE_NAME_TOKEN,
  BDAY_HINT,
  CC_CSC,
  CC_EXP,
  CC_NAME,
  CC_NUMBER,
  CITY,
  COUNTRY,
  CRYPTO_ADDR,
  CRYPTO_PHRASE,
  CRYPTO_PIN,
  DB_NAME,
  DB_PASS,
  DB_PORT,
  DB_SERVER,
  DB_SID,
  DB_USER,
  DENYLIST_HINT,
  EMAIL_HINT,
  EMAIL_OTP_URL as EMAIL_OTP_URL_RE,
  FAMILY_NAME,
  GIVEN_NAME,
  HOUSE,
  IBAN,
  NICKNAME_HINT,
  NON_PERSON_NAME_CONTEXT,
  ORG_HINT,
  ORG_TITLE,
  OTP_HINT,
  PASSPORT_EXPIRY,
  PASSPORT_ISSUE,
  PASSPORT_NUMBER,
  PASSPORT_TYPE,
  PERSON_FULL_NAME_STRONG,
  POSTAL,
  SAWF_DATA_FORM_TYPE_MAP,
  SEARCH_HINT,
  SEX_HINT,
  STATE,
  STREET,
  SWIFT,
  TEL_HINT,
  USER_NAME,
  WHATWG_AUTOCOMPLETE_KIND,
  NATIONALITY,
  ISSUING_AUTH,
  BIRTH_PLACE,
} from "./autofillDictionaries.ts";

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
  /** SAWF-style hint from `data-form-type` (read when present). */
  dataFormType?: string;
};

/** Optional DOM/context signals for ladder step 6 (position / context). */
export type ClassifyContext = {
  /** Field kinds already classified earlier in document order. */
  precedingKinds?: readonly AutofillFieldKind[];
  /** Page / form heading text (Sign in / Register / …). */
  formHeading?: string;
  /** True when this is the first text-like field immediately before a password. */
  firstTextBeforePassword?: boolean;
  /** Index among consecutive password fields (0 = first). */
  passwordIndexAmongPasswords?: number;
  /** Total consecutive password fields in the group. */
  passwordGroupSize?: number;
};

/** Re-export URL cue for callers that imported it from this module. */
export const EMAIL_OTP_URL = EMAIL_OTP_URL_RE;

const KIND_SET = new Set<string>([
  "username",
  "password",
  "otp",
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
  "address",
  "street-address",
  "address-house",
  "address-apartment",
  "address-level1",
  "address-level2",
  "postal-code",
  "country",
  "cc-number",
  "cc-exp",
  "cc-csc",
  "cc-name",
  "bank-name",
  "bank-account-holder",
  "bank-account-number",
  "iban",
  "swift",
  "passport-number",
  "passport-type",
  "nationality",
  "issuing-authority",
  "birth-place",
  "passport-issue",
  "passport-expiry",
  "db-server",
  "db-port",
  "db-name",
  "db-username",
  "db-password",
  "db-sid",
  "crypto-address",
  "crypto-pin",
  "crypto-passphrase",
]);

function asKind(value: string | undefined | null): AutofillFieldKind | null {
  if (!value || !KIND_SET.has(value)) {
    return null;
  }
  return value as AutofillFieldKind;
}

export function attrBlob(el: AutofillInputHints): string {
  return [el.name, el.id, el.autocomplete, el.placeholder, el.ariaLabel, el.labelText]
    .filter(Boolean)
    .join(" ");
}

function labelAriaBlob(el: AutofillInputHints): string {
  return [el.labelText, el.ariaLabel].filter(Boolean).join(" ");
}

function nameIdPlaceholderBlob(el: AutofillInputHints): string {
  return [el.name, el.id, el.placeholder].filter(Boolean).join(" ");
}

function acToken(ac: string, token: string): boolean {
  return ac.split(/\s+/).some((part) => {
    const p = part.toLowerCase();
    return p === token || p.endsWith(`-${token}`) || p.startsWith(`${token}-`);
  });
}

/** Exact `autocomplete=name` (not given-name / family-name / cc-name). */
function acExactName(ac: string): boolean {
  const otherNameKinds = new Set([
    "given-name",
    "family-name",
    "additional-name",
    "cc-name",
    "username",
    "nickname",
  ]);
  return ac.split(/\s+/).some((part) => {
    const p = part.toLowerCase();
    if (p === "name") {
      return true;
    }
    return p.endsWith("-name") && !otherNameKinds.has(p);
  });
}

/**
 * Person full-name field: autocomplete=name, strong cues, or bare «Name»
 * without an entity prefix.
 */
export function isPersonFullNameField(blob: string, autocomplete = ""): boolean {
  const ac = autocomplete.trim().toLowerCase();
  if (acExactName(ac)) {
    return true;
  }
  if (NON_PERSON_NAME_CONTEXT.test(blob)) {
    return false;
  }
  if (PERSON_FULL_NAME_STRONG.test(blob)) {
    return true;
  }
  if (
    acToken(ac, "username") ||
    acToken(ac, "nickname") ||
    ac.includes("username") ||
    USER_NAME.test(blob) ||
    NICKNAME_HINT.test(blob)
  ) {
    return false;
  }
  return BARE_NAME_TOKEN.test(blob);
}

export function isBackupOrRecoveryCodeField(input: AutofillInputHints): boolean {
  const blob = attrBlob(input);
  return BACKUP_RECOVERY_CODE_HINT.test(blob);
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
  if (
    acToken(ac, "search") ||
    ac.split(/\s+/).some((part) => part === "search" || part.endsWith("-search"))
  ) {
    return true;
  }

  const blob = attrBlob(input);
  const role = input.role?.toLowerCase();
  if (role === "searchbox" || role === "switch" || role === "checkbox" || role === "radio") {
    return true;
  }
  if (SEARCH_HINT.test(blob) || DENYLIST_HINT.test(blob)) {
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

function matchKeywordKind(blob: string): AutofillFieldKind | null {
  if (!blob) {
    return null;
  }
  // Backup/recovery before OTP so reserve codes never become otp.
  if (BACKUP_RECOVERY_CODE_HINT.test(blob)) {
    return null;
  }
  if (OTP_HINT.test(blob)) {
    return "otp";
  }
  if (CRYPTO_ADDR.test(blob)) {
    return "crypto-address";
  }
  if (CRYPTO_PHRASE.test(blob)) {
    return "crypto-passphrase";
  }
  if (CRYPTO_PIN.test(blob)) {
    return "crypto-pin";
  }
  if (EMAIL_HINT.test(blob)) {
    return "email";
  }
  if (BDAY_HINT.test(blob)) {
    return "bday";
  }
  if (CC_NUMBER.test(blob)) {
    return "cc-number";
  }
  if (CC_EXP.test(blob)) {
    return "cc-exp";
  }
  if (CC_CSC.test(blob)) {
    return "cc-csc";
  }
  if (CC_NAME.test(blob)) {
    return "cc-name";
  }
  if (APARTMENT.test(blob)) {
    return "address-apartment";
  }
  if (HOUSE.test(blob)) {
    return "address-house";
  }
  if (STREET.test(blob)) {
    return "street-address";
  }
  if (ADDRESS_FULL.test(blob)) {
    return "address";
  }
  if (CITY.test(blob)) {
    return "address-level2";
  }
  if (STATE.test(blob)) {
    return "address-level1";
  }
  if (POSTAL.test(blob)) {
    return "postal-code";
  }
  if (COUNTRY.test(blob)) {
    return "country";
  }
  if (IBAN.test(blob)) {
    return "iban";
  }
  if (SWIFT.test(blob)) {
    return "swift";
  }
  if (BANK_ACCOUNT.test(blob)) {
    return "bank-account-number";
  }
  if (BANK_HOLDER.test(blob)) {
    return "bank-account-holder";
  }
  if (BANK_NAME.test(blob)) {
    return "bank-name";
  }
  if (PASSPORT_NUMBER.test(blob)) {
    return "passport-number";
  }
  if (PASSPORT_TYPE.test(blob)) {
    return "passport-type";
  }
  if (NATIONALITY.test(blob)) {
    return "nationality";
  }
  if (ISSUING_AUTH.test(blob)) {
    return "issuing-authority";
  }
  if (BIRTH_PLACE.test(blob)) {
    return "birth-place";
  }
  if (PASSPORT_ISSUE.test(blob)) {
    return "passport-issue";
  }
  if (PASSPORT_EXPIRY.test(blob)) {
    return "passport-expiry";
  }
  if (DB_PASS.test(blob)) {
    return "db-password";
  }
  if (DB_USER.test(blob)) {
    return "db-username";
  }
  if (DB_NAME.test(blob)) {
    return "db-name";
  }
  if (DB_PORT.test(blob)) {
    return "db-port";
  }
  if (DB_SERVER.test(blob)) {
    return "db-server";
  }
  if (DB_SID.test(blob)) {
    return "db-sid";
  }
  if (GIVEN_NAME.test(blob)) {
    return "given-name";
  }
  if (FAMILY_NAME.test(blob)) {
    return "family-name";
  }
  if (ADDITIONAL_NAME.test(blob)) {
    return "additional-name";
  }
  if (TEL_HINT.test(blob)) {
    return "tel";
  }
  if (SEX_HINT.test(blob)) {
    return "sex";
  }
  if (ORG_HINT.test(blob)) {
    return "organization";
  }
  if (ORG_TITLE.test(blob)) {
    return "organization-title";
  }
  if (NICKNAME_HINT.test(blob)) {
    return "username";
  }
  if (USER_NAME.test(blob)) {
    return "username";
  }
  return null;
}

/** Ladder step 1: SAWF-style data-form-type. */
function classifyFromSawf(input: AutofillInputHints): AutofillFieldKind | null {
  const raw = (input.dataFormType ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (BACKUP_RECOVERY_CODE_HINT.test(raw)) {
    return null;
  }
  const mapped = SAWF_DATA_FORM_TYPE_MAP[raw];
  return asKind(mapped);
}

/**
 * Ladder step 2: autocomplete (WHATWG tokens + common site mistakes).
 * Non-standard values do not block lower steps when unrecognized.
 */
function classifyFromAutocomplete(input: AutofillInputHints): AutofillFieldKind | null {
  const ac = (input.autocomplete ?? "").toLowerCase().trim();
  if (!ac || ac === "on" || ac === "off") {
    return null;
  }
  const parts = ac.split(/\s+/).filter(Boolean);
  // Prefer the last recognizable detail token (section-* / shipping / billing prefixes).
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]!;
    if (part.startsWith("section-") || part === "shipping" || part === "billing" || part === "home" || part === "work" || part === "mobile" || part === "fax" || part === "pager") {
      continue;
    }
    // Strip optional contact type prefixes already handled; map known tokens.
    const mapped = WHATWG_AUTOCOMPLETE_KIND[part];
    if (mapped) {
      if (mapped === "otp" && isBackupOrRecoveryCodeField(input)) {
        return null;
      }
      return asKind(mapped);
    }
    // Compound: billing-email → email
    for (const [token, kind] of Object.entries(WHATWG_AUTOCOMPLETE_KIND)) {
      if (part === token || part.endsWith(`-${token}`)) {
        if (kind === "otp" && isBackupOrRecoveryCodeField(input)) {
          return null;
        }
        return asKind(kind);
      }
    }
  }
  // Partial: one-time without full one-time-code
  if (ac.includes("one-time")) {
    return isBackupOrRecoveryCodeField(input) ? null : "otp";
  }
  return null;
}

/** Ladder step 3: HTML input type (and strong type-adjacent cues). */
function classifyFromType(input: AutofillInputHints): AutofillFieldKind | null {
  const type = (input.type || "text").toLowerCase();
  if (type === "password") {
    if (isBackupOrRecoveryCodeField(input)) {
      return "password";
    }
    // Digit OTP boxes sometimes use type=password.
    if (input.maxLength === 1 && (input.inputMode === "numeric" || input.inputMode === "decimal")) {
      return "otp";
    }
    return "password";
  }
  if (type === "email" || input.inputMode === "email") {
    return "email";
  }
  if (type === "tel" && TEL_HINT.test(attrBlob(input))) {
    return "tel";
  }
  return null;
}

/** Ladder step 4: explicit label / aria. */
function classifyFromLabelAria(input: AutofillInputHints): AutofillFieldKind | null {
  const blob = labelAriaBlob(input);
  if (!blob) {
    return null;
  }
  if (isBackupOrRecoveryCodeField(input)) {
    return null;
  }
  const kind = matchKeywordKind(blob);
  if (kind) {
    return kind;
  }
  if (isPersonFullNameField(blob, "")) {
    return "name";
  }
  return null;
}

/** Ladder step 5: name / id / placeholder. */
function classifyFromNameIdPlaceholder(input: AutofillInputHints): AutofillFieldKind | null {
  const blob = nameIdPlaceholderBlob(input);
  if (!blob) {
    return null;
  }
  if (isBackupOrRecoveryCodeField(input)) {
    return null;
  }
  const kind = matchKeywordKind(blob);
  if (kind) {
    return kind;
  }
  // Bare name=name / id=*name* without username cues.
  if (isPersonFullNameField(attrBlob(input), input.autocomplete ?? "")) {
    return "name";
  }
  return null;
}

/**
 * Ladder step 6: position / context.
 * - First text field before a password → username
 * - Two passwords in a row → new + confirm (both password kind; roles resolved elsewhere)
 * Heading Sign in / Register is consumed by form-type detection; here we only fill gaps.
 */
function classifyFromPositionContext(
  input: AutofillInputHints,
  context: ClassifyContext | undefined,
): AutofillFieldKind | null {
  if (!context) {
    return null;
  }
  const type = (input.type || "text").toLowerCase();
  if (type === "password") {
    return "password";
  }
  if (context.firstTextBeforePassword) {
    const t = type === "text" || type === "email" || type === "tel" || type === "";
    if (t) {
      return type === "email" ? "email" : "username";
    }
  }
  return null;
}

/**
 * Numeric OTP heuristics applied after ladder steps when still unresolved,
 * or to refine password → otp for one-time boxes.
 */
function refineOtpHeuristics(
  input: AutofillInputHints,
  current: AutofillFieldKind | null,
): AutofillFieldKind | null {
  if (isBackupOrRecoveryCodeField(input)) {
    return current === "otp" ? null : current;
  }
  const type = (input.type || "text").toLowerCase();
  const blob = attrBlob(input);
  const numericOtp =
    input.inputMode === "numeric" ||
    input.inputMode === "decimal" ||
    type === "tel" ||
    type === "number";

  if (current === "password") {
    if (OTP_HINT.test(blob)) {
      return "otp";
    }
    if (input.maxLength === 1 && numericOtp) {
      return "otp";
    }
    return current;
  }

  if (current) {
    return current;
  }

  if (OTP_HINT.test(blob)) {
    return "otp";
  }
  // Segmented OTP digit boxes (owned fixtures: 4 / 6 / 8 cells) — with or without
  // autocomplete=one-time-code on every cell.
  if (input.maxLength === 1 && numericOtp) {
    return "otp";
  }
  if (numericOtp && (input.maxLength === 6 || input.maxLength === 8) && /code|pass/i.test(blob)) {
    return "otp";
  }
  return null;
}

/**
 * Classify a page input for autofill (login + personal / finance / docs / db / crypto).
 * Returns null when the field is not a known autofill target.
 *
 * Signal ladder: SAWF → autocomplete → type → label/aria → name/id/placeholder → position.
 * The first confident step wins; later steps do not overwrite.
 */
export function classifyAutofillInput(
  input: AutofillInputHints,
  context?: ClassifyContext,
): AutofillFieldKind | null {
  if (isDeniedAutofillField(input)) {
    return null;
  }

  // Backup/recovery codes are never OTP and are not login password targets.
  if (isBackupOrRecoveryCodeField(input)) {
    return null;
  }

  let kind: AutofillFieldKind | null = null;

  // 1. SAWF
  kind = classifyFromSawf(input);
  if (kind) {
    return refineOtpHeuristics(input, kind) ?? kind;
  }

  // 2. autocomplete
  kind = classifyFromAutocomplete(input);
  if (kind) {
    // type=password + autocomplete current/new stays password; otp tokens → otp
    if (kind === "password" && (input.type || "").toLowerCase() === "password") {
      return refineOtpHeuristics(input, "password") ?? "password";
    }
    return refineOtpHeuristics(input, kind) ?? kind;
  }

  // 3. type
  kind = classifyFromType(input);
  if (kind) {
    // Password type alone is confident; still allow OTP refine for digit boxes / OTP names.
    if (kind === "password") {
      const refined = refineOtpHeuristics(input, kind);
      // DB / crypto password specializations from name blob (step 5 cues on password type).
      const blob = attrBlob(input);
      if (refined === "password" || refined === null) {
        if (DB_PASS.test(blob)) {
          return "db-password";
        }
        if (CRYPTO_PHRASE.test(blob)) {
          return "crypto-passphrase";
        }
        if (CRYPTO_PIN.test(blob)) {
          return "crypto-pin";
        }
      }
      return refined ?? kind;
    }
    return kind;
  }

  // 4. label / aria
  kind = classifyFromLabelAria(input);
  if (kind) {
    return kind;
  }

  // 5. name / id / placeholder
  kind = classifyFromNameIdPlaceholder(input);
  if (kind) {
    return kind;
  }

  // 6. position / context
  kind = classifyFromPositionContext(input, context);
  if (kind) {
    return kind;
  }

  // Residual OTP numeric heuristics when nothing else matched.
  return refineOtpHeuristics(input, null);
}

/** Login-oriented classification (email → username for fill buckets). */
export function classifyLoginInput(
  input: AutofillInputHints,
  context?: ClassifyContext,
): "username" | "password" | "otp" | null {
  const kind = classifyAutofillInput(input, context);
  if (kind === "password" || kind === "otp") {
    return kind;
  }
  if (kind === "username" || kind === "email" || kind === "db-username") {
    return "username";
  }
  return null;
}

/** Nearby label / heading text to the left or above the input. */
function nearbyLabelText(el: HTMLInputElement): string {
  const parts: string[] = [];
  const dataLabel =
    el.getAttribute("data-label") ||
    el.getAttribute("data-field-label") ||
    el.dataset?.label ||
    "";
  if (dataLabel) {
    parts.push(dataLabel);
  }
  try {
    const prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|DIV|P|STRONG|B)$/i.test(prev.tagName)) {
      const text = prev.textContent?.trim() ?? "";
      if (text && text.length < 120) {
        parts.push(text);
      }
    }
    const fieldset = el.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    if (legend?.textContent) {
      parts.push(legend.textContent);
    }
  } catch {
    /* ignore */
  }
  return parts.join(" ").trim();
}

/**
 * Query fillable inputs under root, including open shadow roots (cheap BFS).
 * Same-origin iframes stay out of scope — routed by their own content script.
 * Closed shadow roots are not accessible from a content script and are not pierced.
 */
export function queryAutofillInputs(root: ParentNode): HTMLInputElement[] {
  const found: HTMLInputElement[] = [];
  const visit = (node: ParentNode): void => {
    const list =
      typeof (node as ParentNode & { querySelectorAll?: unknown }).querySelectorAll === "function"
        ? Array.from((node as ParentNode).querySelectorAll("input"))
        : [];
    for (const el of list) {
      if (el instanceof HTMLInputElement) {
        found.push(el);
      }
    }
    const hosts =
      typeof (node as ParentNode & { querySelectorAll?: unknown }).querySelectorAll === "function"
        ? Array.from((node as ParentNode).querySelectorAll("*"))
        : [];
    for (const host of hosts) {
      if (!(host instanceof Element)) {
        continue;
      }
      const shadow = (host as HTMLElement).shadowRoot;
      if (shadow) {
        visit(shadow);
      }
    }
  };
  visit(root);
  return found;
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
  const nearby = nearbyLabelText(el);
  if (nearby) {
    labelText = `${labelText} ${nearby}`.trim();
  }
  const autocompleteAttr = el.getAttribute("autocomplete")?.trim() || undefined;
  const autocompleteIdl = el.autocomplete?.trim() || undefined;
  const autocomplete =
    autocompleteAttr && autocompleteAttr !== "on" && autocompleteAttr !== "off"
      ? autocompleteAttr
      : autocompleteIdl && autocompleteIdl !== "on" && autocompleteIdl !== "off"
        ? autocompleteIdl
        : autocompleteAttr || autocompleteIdl || undefined;

  const dataFormType =
    el.getAttribute("data-form-type")?.trim() ||
    el.getAttribute("data-formtype")?.trim() ||
    undefined;

  return {
    type: el.type,
    name: el.name,
    id: el.id,
    autocomplete,
    placeholder: el.placeholder,
    ariaLabel: el.getAttribute("aria-label") ?? undefined,
    labelText: labelText || undefined,
    inputMode: el.inputMode,
    maxLength: el.maxLength,
    role: el.getAttribute("role") ?? undefined,
    dataFormType,
  };
}

export function collectPageFieldKinds(root: ParentNode): AutofillFieldKind[] {
  const kinds = new Set<AutofillFieldKind>();
  for (const node of queryAutofillInputs(root)) {
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
 * cannot mix suggestion types.
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

/**
 * Extra OTP detection when classify returns null but the page is clearly an
 * email-OTP / 2FA step (URL + numeric/text code field).
 */
export function looksLikeEmailOtpField(input: AutofillInputHints, pageUrl: string): boolean {
  if (isBackupOrRecoveryCodeField(input)) {
    return false;
  }
  if (classifyAutofillInput(input) === "otp") {
    return true;
  }
  if (!EMAIL_OTP_URL.test(pageUrl)) {
    return false;
  }
  const type = (input.type || "text").toLowerCase();
  if (type !== "text" && type !== "tel" && type !== "number" && type !== "password") {
    return false;
  }
  if (isDeniedAutofillField(input)) {
    return false;
  }
  const blob = attrBlob(input);
  const numeric =
    input.inputMode === "numeric" ||
    input.inputMode === "decimal" ||
    type === "tel" ||
    type === "number";
  return numeric || OTP_HINT.test(blob) || /pass(?:word|code)|code/i.test(blob);
}

/**
 * Resolve the focused field kind for suggestion queries, including email-OTP URL fallback.
 */
export function resolveFocusedAutofillKind(
  input: AutofillInputHints,
  pageUrl?: string,
): AutofillFieldKind | null {
  const kind = classifyAutofillInput(input);
  if (kind) {
    return kind;
  }
  if (pageUrl && looksLikeEmailOtpField(input, pageUrl)) {
    return "otp";
  }
  return null;
}
