import {
  classifyAutofillInput,
  collectInputHints,
  isDeniedAutofillField,
  type AutofillFieldKind,
  type AutofillInputHints,
} from "./autofillFieldClassify.ts";

function isVisibleInput(el: HTMLInputElement): boolean {
  if (el.disabled) {
    return false;
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.visibility === "hidden" || style.display === "none")) {
    return false;
  }
  return el.getClientRects().length > 0;
}

/**
 * High-level page/form intent for autofill suggestions & generators.
 * `search` → skip autofill; `login` → only login items; `register` → personal_data + generators.
 */
export type AutofillFormType =
  | "login"
  | "register"
  | "checkout"
  | "identity"
  | "search"
  | "unknown";

export type AutofillFormSignals = {
  fieldKinds: AutofillFieldKind[];
  passwordFields: AutofillInputHints[];
  /** True when ≥2 password fields or one looks like confirm/repeat. */
  hasConfirmPassword: boolean;
  hasNewPasswordAc: boolean;
  hasCurrentPasswordAc: boolean;
  formTextBlob: string;
  urlPath: string;
};

/**
 * Unicode-aware edges — JS `\b` is ASCII-only, so RU «Вход»/«Войти» never matched.
 * Lookbehind/ahead treat letters (any script), digits, and `_` as word chars.
 */
const REGISTER_TEXT =
  /(?<![\p{L}\p{N}_])(?:sign[-_\s]?up|register|registration|create[-_\s]?account|join[-_\s]?now|get[-_\s]?started|регистрац\p{L}*|зарегистрир\p{L}*|создать\s*аккаунт|создай(?:те)?\s*аккаунт|завести\s*аккаунт)(?![\p{L}\p{N}_])/iu;

const LOGIN_TEXT =
  /(?<![\p{L}\p{N}_])(?:sign[-_\s]?in|log[-_\s]?in|log[-_\s]?on|auth(?:enticate)?|войти|вход(?:[аеу]|ите)?|авторизац\p{L}*)(?![\p{L}\p{N}_])/iu;

/** “Back to Login” / “Go to login” on a register form must not count as a login signal. */
const BACK_TO_LOGIN_TEXT =
  /(?<![\p{L}\p{N}_])(?:(?:back|go|goto|return)\s+to\s+log[-_\s]?in|назад\s+(?:ко?\s+)?входу|к\s+входу)(?![\p{L}\p{N}_])/giu;

/** Strong login cue even when password uses autocomplete=new-password (Shopify, etc.). */
const FORGOT_PASSWORD_TEXT =
  /(?<![\p{L}\p{N}_])(?:forgot(?:\s+\w+){0,3}\s+password|password\s+reset|забыл[аи]?\s+парол\p{L}*|восстанов(?:ить|ление)\s+парол\p{L}*)(?![\p{L}\p{N}_])/iu;

function textSuggestsLogin(text: string): boolean {
  const cleaned = text.replace(BACK_TO_LOGIN_TEXT, " ");
  return LOGIN_TEXT.test(cleaned) || FORGOT_PASSWORD_TEXT.test(cleaned);
}

const CHECKOUT_TEXT =
  /\b(checkout|payment|billing|pay\b|корзин|оплат|платеж|checkout)\b/i;

const IDENTITY_TEXT =
  /\b(profile|account[-_\s]?settings|personal[-_\s]?info|edit[-_\s]?profile|профиль|личные\s*данные|настройки\s*аккаунт)\b/i;

const SEARCH_TEXT = /\b(search|поиск|найти|filter|фильтр)\b/i;

const CONFIRM_PASSWORD =
  /\b(confirm|repeat|re[-_]?type|re[-_]?enter|verify|подтверд|повтор|ещё\s*раз|еще\s*раз|пароль\s*ещё|пароль\s*еще)\b/i;

const CC_KINDS = new Set<AutofillFieldKind>(["cc-number", "cc-exp", "cc-csc", "cc-name"]);
const IDENTITY_KINDS = new Set<AutofillFieldKind>([
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
]);

function acToken(ac: string, token: string): boolean {
  return ac.split(/\s+/).some((part) => {
    const p = part.toLowerCase();
    return p === token || p.endsWith(`-${token}`) || p.startsWith(`${token}-`);
  });
}

function hintBlob(hints: AutofillInputHints): string {
  return [hints.name, hints.id, hints.autocomplete, hints.placeholder, hints.ariaLabel, hints.labelText]
    .filter(Boolean)
    .join(" ");
}

function isConfirmPasswordHints(hints: AutofillInputHints): boolean {
  const ac = (hints.autocomplete ?? "").toLowerCase();
  if (acToken(ac, "new-password") && CONFIRM_PASSWORD.test(hintBlob(hints))) {
    return true;
  }
  return CONFIRM_PASSWORD.test(hintBlob(hints));
}

function collectNearbyText(form: Element | null, doc: Document): string {
  const parts: string[] = [];
  if (form instanceof HTMLFormElement) {
    parts.push(form.id, form.name, form.action, form.className, form.getAttribute("aria-label") ?? "");
  }
  try {
    const root = form ?? doc.body;
    const heading = root?.querySelector?.(
      "h1, h2, h3, [role='heading'], legend, .title, .form-title",
    );
    if (heading?.textContent) {
      parts.push(heading.textContent);
    }
    // Submit / CTA labels often say “Sign up” / «Регистрация» when headings do not.
    const buttons = root?.querySelectorAll?.(
      "button, [type='submit'], input[type='submit'], a[role='button']",
    );
    if (buttons) {
      for (const btn of Array.from(buttons).slice(0, 8)) {
        const label =
          (btn instanceof HTMLInputElement ? btn.value : btn.textContent)?.trim() ?? "";
        if (label) {
          parts.push(label);
        }
      }
    }
    // “Forgot password?” is a strong login cue (plain <a>, not a submit button).
    const links = root?.querySelectorAll?.("a[href]");
    if (links) {
      for (const link of Array.from(links).slice(0, 12)) {
        const label = link.textContent?.trim() ?? "";
        if (label && FORGOT_PASSWORD_TEXT.test(label)) {
          parts.push(label);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * Hidden username/email (e.g. Shopify `#account_email`) still identify login forms
 * even when the visible identifier is plain text / readonly chrome.
 */
function hiddenCredentialKind(hints: AutofillInputHints): AutofillFieldKind | null {
  if ((hints.type || "").toLowerCase() !== "hidden") {
    return null;
  }
  const ac = (hints.autocomplete ?? "").toLowerCase().trim();
  if (acToken(ac, "email") || ac.includes("email")) {
    return "email";
  }
  if (acToken(ac, "username") || ac.includes("username")) {
    return "username";
  }
  return null;
}

/**
 * Collect classified fields inside a form (or document fallback) for form-type heuristics.
 */
export function collectAutofillFormSignals(
  root: ParentNode,
  options?: { urlPath?: string; formTextBlob?: string },
): AutofillFormSignals {
  const fieldKinds: AutofillFieldKind[] = [];
  const passwordFields: AutofillInputHints[] = [];
  const nodes = Array.from(root.querySelectorAll("input"));

  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement)) {
      continue;
    }
    const hints = collectInputHints(node);
    const hiddenKind = hiddenCredentialKind(hints);
    if (hiddenKind) {
      fieldKinds.push(hiddenKind);
      continue;
    }
    if (!isVisibleInput(node)) {
      continue;
    }
    if (isDeniedAutofillField(hints) && node.type.toLowerCase() !== "password") {
      continue;
    }
    const kind = classifyAutofillInput(hints);
    if (!kind) {
      continue;
    }
    fieldKinds.push(kind);
    if (kind === "password") {
      passwordFields.push(hints);
    }
  }

  const hasConfirmPassword =
    passwordFields.length >= 2 || passwordFields.some((hints) => isConfirmPasswordHints(hints));
  const hasNewPasswordAc = passwordFields.some((hints) =>
    acToken((hints.autocomplete ?? "").toLowerCase(), "new-password"),
  );
  const hasCurrentPasswordAc = passwordFields.some((hints) =>
    acToken((hints.autocomplete ?? "").toLowerCase(), "current-password"),
  );

  return {
    fieldKinds,
    passwordFields,
    hasConfirmPassword,
    hasNewPasswordAc,
    hasCurrentPasswordAc,
    formTextBlob: options?.formTextBlob ?? "",
    urlPath: options?.urlPath ?? "",
  };
}

/**
 * Heuristic form-type detection from field shape + surrounding text / URL.
 *
 * Priority (high → low):
 * 1. search
 * 2. checkout/payment (card fields)
 * 3. strong login cues (login wording / forgot-password /login path) over new-password alone
 * 4. register (confirm password / new-password / signup text / identity+password)
 * 5. login (single password + username/email)
 * 6. identity/profile (personal fields, no password)
 * 7. unknown
 */
export function detectAutofillFormType(signals: AutofillFormSignals): AutofillFormType {
  const text = `${signals.formTextBlob} ${signals.urlPath}`;
  const kinds = new Set(signals.fieldKinds);
  const hasPassword = kinds.has("password");
  const hasUser = kinds.has("username") || kinds.has("email");
  const hasCard = [...kinds].some((k) => CC_KINDS.has(k));
  const hasIdentity = [...kinds].some((k) => IDENTITY_KINDS.has(k));
  const passwordCount = signals.passwordFields.length;
  const loginCue = textSuggestsLogin(text);
  const registerCue = REGISTER_TEXT.test(text);
  const classicLoginShape =
    hasPassword && hasUser && passwordCount === 1 && !signals.hasConfirmPassword;

  if (SEARCH_TEXT.test(text) && !hasPassword && !hasCard) {
    return "search";
  }

  if (hasCard || CHECKOUT_TEXT.test(text)) {
    return "checkout";
  }

  // Shopify /login etc.: sites often set autocomplete=new-password on a real login field.
  // Strong login cues + classic shape beat new-password-alone register heuristics.
  if (classicLoginShape && loginCue && !registerCue) {
    return "login";
  }

  const registerByShape =
    signals.hasConfirmPassword ||
    (signals.hasNewPasswordAc && passwordCount >= 1 && !signals.hasCurrentPasswordAc) ||
    (signals.hasNewPasswordAc && signals.hasConfirmPassword) ||
    (hasPassword && hasIdentity && passwordCount >= 1);

  if (registerByShape || (registerCue && hasPassword)) {
    return "register";
  }

  // Explicit login wording wins over bare identity when a single password is present.
  if (classicLoginShape) {
    if (loginCue || !registerCue) {
      return "login";
    }
  }

  if (hasPassword && hasUser && passwordCount === 1) {
    return "login";
  }

  if (hasIdentity && !hasPassword) {
    return "identity";
  }

  if (IDENTITY_TEXT.test(text) && hasIdentity) {
    return "identity";
  }

  if (hasPassword && hasUser) {
    return "login";
  }

  return "unknown";
}

/**
 * Resolve form type for a focused input: prefer containing `<form>`, else document.
 */
export function detectFormTypeForInput(
  input: HTMLInputElement,
  options?: { urlPath?: string },
): AutofillFormType {
  const form = input.form ?? input.closest("form");
  const root: ParentNode = form ?? input.ownerDocument;
  const urlPath =
    options?.urlPath ??
    (() => {
      try {
        return input.ownerDocument.defaultView?.location?.pathname ?? "";
      } catch {
        return "";
      }
    })();
  const formTextBlob = collectNearbyText(form, input.ownerDocument);
  const signals = collectAutofillFormSignals(root, { urlPath, formTextBlob });
  return detectAutofillFormType(signals);
}

/**
 * Resolve form type for a `<form>` (or document) — used on submit / register CTA click.
 */
export function detectFormTypeForRoot(
  root: ParentNode,
  doc: Document,
  options?: { urlPath?: string; formEl?: Element | null },
): AutofillFormType {
  const formEl =
    options?.formEl ?? (root instanceof HTMLFormElement ? root : root.querySelector?.("form"));
  const urlPath =
    options?.urlPath ??
    (() => {
      try {
        return doc.defaultView?.location?.pathname ?? "";
      } catch {
        return "";
      }
    })();
  const formTextBlob = collectNearbyText(formEl instanceof Element ? formEl : null, doc);
  return detectAutofillFormType(collectAutofillFormSignals(root, { urlPath, formTextBlob }));
}

/** Login / register CTAs that are often `type="button"` (SPA) instead of submit. */
const AUTH_SUBMIT_TEXT =
  /(?<![\p{L}\p{N}_])(?:sign[-_\s]?up|sign[-_\s]?in|log[-_\s]?in|log[-_\s]?on|register|registration|create[-_\s]?account|create|continue|next|submit|join|войти|вход(?:[аеу]|ите)?|регистрац\p{L}*|зарегистрир\p{L}*|создать(?:\s*аккаунт)?|продолжить|далее|отправить)(?![\p{L}\p{N}_])/iu;

/** id/name heuristics — demoqa `#register`, Shopify login buttons, etc. */
const AUTH_SUBMIT_ID_NAME =
  /^(?:btn[-_]?)?(?:register|registration|signup|sign[-_]?up|signin|sign[-_]?in|login|log[-_]?in|create[-_]?account|submit)$/i;

/**
 * True for native submit controls, or type=button / role=button with login/register CTA
 * label near a password field (covers SPA register without form.submit).
 */
export function isAuthCredentialSubmitControl(el: Element): boolean {
  if (el.matches('button[type="submit"], input[type="submit"], button:not([type])')) {
    return true;
  }
  if (!el.matches('button[type="button"], input[type="button"], [role="button"]')) {
    return false;
  }
  const label =
    (
      (el instanceof HTMLInputElement ? el.value : el.textContent) ||
      el.getAttribute("aria-label") ||
      ""
    ).trim();
  // “Back to Login” contains “login” but must not trigger a save offer.
  // Reset lastIndex — BACK_TO_LOGIN_TEXT is /g and .test() is sticky.
  if (label) {
    BACK_TO_LOGIN_TEXT.lastIndex = 0;
    if (BACK_TO_LOGIN_TEXT.test(label)) {
      return false;
    }
  }
  const idOrName = el.id || el.getAttribute("name") || "";
  const labelMatch = Boolean(label && AUTH_SUBMIT_TEXT.test(label));
  const idMatch = Boolean(idOrName && AUTH_SUBMIT_ID_NAME.test(idOrName));
  if (!labelMatch && !idMatch) {
    return false;
  }
  const form = el.closest("form");
  const root: ParentNode = form ?? el.ownerDocument;
  try {
    return Boolean(root.querySelector?.('input[type="password"]'));
  } catch {
    return false;
  }
}

/** Forms where we offer the save-login prompt after submit. */
export function isSaveOfferFormType(formType: AutofillFormType): boolean {
  return formType === "login" || formType === "register";
}

/** True when the focused field is a confirm/repeat password on a register form. */
export function isConfirmPasswordField(input: HTMLInputElement): boolean {
  return isConfirmPasswordHints(collectInputHints(input));
}

/**
 * Username (login) field that is NOT an email — for username generator on register.
 */
export function isUsernameGeneratorField(kind: AutofillFieldKind | null): boolean {
  return kind === "username";
}

/**
 * Password field kind that should open the password generator (register / new-password contexts).
 */
export function isPasswordGeneratorField(kind: AutofillFieldKind | null): boolean {
  return kind === "password";
}

/** True when the focused password field is a confirm/repeat password control. */
export function shouldOpenPasswordGenerator(
  formType: AutofillFormType,
  kind: AutofillFieldKind | null,
  input?: HTMLInputElement | null,
): boolean {
  if (!isPasswordGeneratorField(kind)) {
    return false;
  }
  if (formType === "register") {
    return true;
  }
  // Confirm/repeat password is always a generator context, even if form type is ambiguous.
  if (input && isConfirmPasswordField(input)) {
    return true;
  }
  return false;
}

/**
 * Vault categories allowed for a form type + focused field kind.
 * Login never surfaces personal_data; register prefers personal_data for identity fields.
 */
export function categoriesAllowedForFormType(
  formType: AutofillFormType,
  fieldKind: string | null | undefined,
): readonly string[] | null {
  // null = no restriction beyond categoriesForFieldKinds
  if (formType === "search") {
    return [];
  }
  if (formType === "login") {
    return ["login"];
  }
  if (formType === "register") {
    // Password → generator only. Username → nickname suggestions (personal_data) or generator.
    if (fieldKind === "password") {
      return [];
    }
    return ["personal_data"];
  }
  if (formType === "checkout") {
    if (
      fieldKind === "cc-number" ||
      fieldKind === "cc-exp" ||
      fieldKind === "cc-csc" ||
      fieldKind === "cc-name"
    ) {
      return ["credit_card"];
    }
    if (
      fieldKind === "iban" ||
      fieldKind === "swift" ||
      fieldKind === "bank-account-number" ||
      fieldKind === "bank-name" ||
      fieldKind === "bank-account-holder"
    ) {
      return ["bank_account"];
    }
    // Email on checkout receipt — personal_data only (not login mix).
    if (fieldKind === "email" || fieldKind === "username") {
      return ["personal_data"];
    }
    return null;
  }
  if (formType === "identity") {
    return ["personal_data", "passport"];
  }
  return null;
}
