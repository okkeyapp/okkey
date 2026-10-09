import {
  formatKeyFieldAddressCopyValue,
  type KeyFieldAddressValue,
} from "@okkey/ui/lib/key-field-address";

import {
  attrBlob,
  classifyAutofillInput,
  classifyLoginInput as classifyLoginInputImpl,
  collectInputHints,
  type AutofillInputHints,
} from "./autofillFieldClassify.ts";

export type LoginFieldKind = "username" | "password" | "otp";

export {
  classifyAutofillInput,
  collectInputHints,
  collectPageFieldKinds,
  suggestionFieldKindsForFocus,
  type AutofillFieldKind,
  type AutofillInputHints,
} from "./autofillFieldClassify.ts";

const OTP_NAME = /one[-_]?time|otp|totp|2fa|mfa|authenticator|verification[-_]?code|auth[-_]?code|^code$/i;

export function classifyLoginInput(input: AutofillInputHints): LoginFieldKind | null {
  return classifyLoginInputImpl(input);
}

export function isVisibleFillableElement(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.disabled || el.readOnly) {
    return false;
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.visibility === "hidden" || style.display === "none")) {
    return false;
  }
  return el.getClientRects().length > 0;
}

function isSingleDigitOtpCandidate(input: HTMLInputElement): boolean {
  if (input.maxLength !== 1) {
    return false;
  }
  const type = input.type.toLowerCase();
  if (type !== "text" && type !== "tel" && type !== "number" && type !== "password") {
    return false;
  }
  if (input.inputMode === "numeric" || input.inputMode === "decimal") {
    return true;
  }
  const pattern = input.getAttribute("pattern") ?? "";
  if (pattern === "\\d" || pattern === "[0-9]" || pattern === "[0-9]*") {
    return true;
  }
  return OTP_NAME.test(attrBlob(collectInputHints(input)));
}

/** Collect adjacent maxlength=1 boxes (typical 4–8 OTP digits) under the same parent. */
function collectDigitOtpGroups(inputs: HTMLInputElement[]): HTMLInputElement[] {
  const byParent = new Map<ParentNode, HTMLInputElement[]>();
  for (const input of inputs) {
    if (!isSingleDigitOtpCandidate(input)) {
      continue;
    }
    const parent = input.parentElement;
    if (!parent) {
      continue;
    }
    const list = byParent.get(parent) ?? [];
    list.push(input);
    byParent.set(parent, list);
  }
  const found: HTMLInputElement[] = [];
  for (const group of byParent.values()) {
    if (group.length >= 4 && group.length <= 8) {
      found.push(...group);
    }
  }
  return found;
}

export function findLoginFields(root: ParentNode): {
  username: HTMLInputElement[];
  password: HTMLInputElement[];
  otp: HTMLInputElement[];
} {
  const username: HTMLInputElement[] = [];
  const password: HTMLInputElement[] = [];
  const otp: HTMLInputElement[] = [];
  const nodes = Array.from(root.querySelectorAll("input"));
  const classified = new Set<HTMLInputElement>();

  // Prefer multi-box OTP groups first so type=password digit boxes never get password fill.
  const digitGroup = collectDigitOtpGroups(
    nodes.filter(
      (node): node is HTMLInputElement =>
        node instanceof HTMLInputElement && isVisibleFillableElement(node),
    ),
  );
  if (digitGroup.length >= 4) {
    for (const node of digitGroup) {
      otp.push(node);
      classified.add(node);
    }
  }

  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement) || !isVisibleFillableElement(node) || classified.has(node)) {
      continue;
    }
    const hints = collectInputHints(node);
    const kind = classifyLoginInput(hints);
    if (kind === "username") {
      username.push(node);
      classified.add(node);
    } else if (kind === "password") {
      password.push(node);
      classified.add(node);
    } else if (kind === "otp") {
      otp.push(node);
      classified.add(node);
    }
  }
  return { username, password, otp };
}

/** Anchor toggle/panel to the first OTP digit when focusing a multi-box group. */
export function resolveAutofillAnchorInput(active: HTMLInputElement): HTMLInputElement {
  const doc = active.ownerDocument;
  if (!doc) {
    return active;
  }
  const fields = findLoginFields(doc);
  if (fields.otp.length > 1 && fields.otp.includes(active)) {
    return fields.otp[0] ?? active;
  }
  return active;
}

function nativeValueSetter(el: HTMLInputElement | HTMLTextAreaElement): ((v: string) => void) | undefined {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  return desc?.set
    ? (value) => {
        desc.set!.call(el, value);
      }
    : undefined;
}

/** Digits-only view of a string (card / exp / cvc comparisons). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Apply a maska-style pattern (`#` = digit, other chars = literals) to a raw value.
 * Example: `#### ####` + `41111111` → `4111 1111`; `##/##` + `12/30` → `12/30`.
 */
export function applySimpleMaska(value: string, mask: string): string {
  const digits = digitsOnly(value);
  if (!mask || !mask.includes("#")) {
    return value;
  }
  let digitIndex = 0;
  let out = "";
  for (const ch of mask) {
    if (digitIndex >= digits.length) {
      break;
    }
    if (ch === "#") {
      out += digits[digitIndex]!;
      digitIndex += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Prefer data-maska / data-mask formatting when the page uses maska (Robokassa, etc.). */
export function resolveFillValueForInput(
  el: Pick<Element, "getAttribute"> | HTMLInputElement | HTMLTextAreaElement,
  value: string,
): string {
  const mask =
    typeof el.getAttribute === "function"
      ? (el.getAttribute("data-maska") ?? el.getAttribute("data-mask") ?? "")
      : "";
  if (mask.includes("#")) {
    return applySimpleMaska(value, mask);
  }
  return value;
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const set = nativeValueSetter(el);
  if (set) {
    set(value);
  } else {
    el.value = value;
  }
}

function dispatchFillEvents(el: HTMLInputElement | HTMLTextAreaElement, value: string, inputType: string): void {
  try {
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType,
        data: value,
      }),
    );
  } catch {
    /* older engines may lack beforeinput InputEvent fields */
  }
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType,
      data: value,
    }),
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Write a value into a page input the way controlled / maska fields expect:
 * native value setter + beforeinput/input (insertFromPaste), with char-by-char fallback.
 * Do not focus: focusing re-opens the suggestion dropdown.
 */
export function fillInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const next = resolveFillValueForInput(el, value);
  if (!next) {
    return;
  }
  // Exact match only — digits-equal but unformatted still needs maska spacing (e.g. #### ####).
  if (el.value === next) {
    return;
  }

  if (el.value) {
    setInputValue(el, "");
    dispatchFillEvents(el, "", "deleteContentBackward");
  }

  setInputValue(el, next);
  dispatchFillEvents(el, next, "insertFromPaste");

  // Maska / Vue sometimes ignore bulk paste — type the formatted value instead.
  if (digitsOnly(el.value) !== digitsOnly(next)) {
    setInputValue(el, "");
    dispatchFillEvents(el, "", "deleteContentBackward");
    let built = "";
    for (const ch of next) {
      built += ch;
      setInputValue(el, built);
      dispatchFillEvents(el, ch, "insertText");
    }
  }
}

/** Split a TOTP string across OTP inputs (1 digit per box when multi-box). */
export function otpValuesForFields(totp: string, fieldCount: number, maxLengths: number[]): string[] {
  if (fieldCount <= 0 || !totp) {
    return [];
  }
  const digitBoxes =
    fieldCount > 1 &&
    (maxLengths.every((max) => max === 1) || fieldCount === totp.length);
  if (digitBoxes) {
    return Array.from({ length: fieldCount }, (_, i) => totp.charAt(i) || "");
  }
  return Array.from({ length: fieldCount }, () => totp);
}

function fillOtpFields(
  otpFields: HTMLInputElement[],
  totp: string,
  options?: Pick<AutofillFillTargetOptions, "onlyEmpty" | "forceFill">,
): void {
  if (otpFields.length === 0 || !totp) {
    return;
  }
  const values = otpValuesForFields(
    totp,
    otpFields.length,
    otpFields.map((el) => el.maxLength),
  );
  for (let i = 0; i < otpFields.length; i += 1) {
    const el = otpFields[i];
    const value = values[i];
    if (!el || value === undefined) {
      continue;
    }
    if (shouldSkipNonEmptyField(el, options)) {
      continue;
    }
    fillInputValue(el, value);
  }
}

export type FillLoginFormOptions = Pick<AutofillFillTargetOptions, "onlyEmpty" | "forceFill">;

export function fillLoginForm(
  root: ParentNode,
  payload: { username: string; password: string; totp?: string },
  options?: FillLoginFormOptions,
): void {
  const fields = findLoginFields(root);
  if (payload.username) {
    for (const el of fields.username) {
      if (shouldSkipNonEmptyField(el, options)) {
        continue;
      }
      fillInputValue(el, payload.username);
    }
  }
  if (payload.password) {
    for (const el of fields.password) {
      if (shouldSkipNonEmptyField(el, options)) {
        continue;
      }
      fillInputValue(el, payload.password);
    }
  }
  if (payload.totp) {
    fillOtpFields(fields.otp, payload.totp, options);
  }
}

const CREDIT_CARD_FIELD_KINDS = new Set(["cc-number", "cc-exp", "cc-csc", "cc-name"]);

function isDisabledOrReadonly(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  return el.disabled || el.readOnly;
}

function isTypeHiddenInput(el: HTMLInputElement): boolean {
  return el.type.toLowerCase() === "hidden";
}

export type AutofillFillTargetOptions = {
  /** Fill cc-* inputs even when currently not visible (display:none wrapper). */
  allowHiddenCreditCard?: boolean;
  /** Skip inputs that already have a non-empty value (unless {@link forceFill}). */
  onlyEmpty?: boolean;
  /** Always overwrite this element even when {@link onlyEmpty} (focused page field). */
  forceFill?: HTMLInputElement | HTMLTextAreaElement | null;
};

function shouldSkipNonEmptyField(
  el: HTMLInputElement | HTMLTextAreaElement,
  options?: Pick<AutofillFillTargetOptions, "onlyEmpty" | "forceFill">,
): boolean {
  if (!options?.onlyEmpty) {
    return false;
  }
  if (options.forceFill === el) {
    return false;
  }
  return el.value.trim().length > 0;
}

/**
 * Whether an input may receive autofill.
 * Credit-card fields on Robokassa-like checkouts often live in `display:none` wrappers
 * until the number is entered — still fill them when present in the DOM.
 */
export function isAutofillTargetElement(
  el: HTMLInputElement,
  kind: string | null,
  options?: AutofillFillTargetOptions,
): boolean {
  if (isTypeHiddenInput(el) || isDisabledOrReadonly(el)) {
    return false;
  }
  if (shouldSkipNonEmptyField(el, options)) {
    return false;
  }
  const allowHiddenCc =
    Boolean(options?.allowHiddenCreditCard) && kind != null && CREDIT_CARD_FIELD_KINDS.has(kind);
  if (allowHiddenCc) {
    return true;
  }
  return isVisibleFillableElement(el);
}

const ADDRESS_FILL_KINDS = new Set([
  "address",
  "street-address",
  "address-house",
  "address-apartment",
  "address-level1",
  "address-level2",
  "postal-code",
  "country",
]);

/** Prefer page lang, then navigator — used for one-line address autofill. */
export function resolvePageAddressLocale(doc: Document = document): string {
  const lang = doc.documentElement.lang?.trim() || navigator.language?.trim() || "en";
  return lang;
}

/**
 * Rebuild `values.address` from structured parts using the page/UI locale.
 * Structured street/city/… keys stay unchanged for multi-field fill.
 */
export function applyPageLocaleAddressFormat(
  values: Partial<Record<string, string>>,
  locale?: string,
): Partial<Record<string, string>> {
  const address: KeyFieldAddressValue = {
    apartment: values["address-apartment"] ?? "",
    house: values["address-house"] ?? "",
    street: values["street-address"] ?? "",
    city: values["address-level2"] ?? "",
    state: values["address-level1"] ?? "",
    postalCode: values["postal-code"] ?? "",
    country: values.country ?? "",
  };
  const hasPart = [
    address.apartment,
    address.house,
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].some((part) => part.trim().length > 0);
  if (!hasPart) {
    return values;
  }
  const formatted = formatKeyFieldAddressCopyValue(address, locale || resolvePageAddressLocale());
  if (!formatted) {
    return values;
  }
  return { ...values, address: formatted };
}

function resolveAutofillValueForKind(
  kind: string,
  values: Partial<Record<string, string>>,
  options?: { useFormattedAddress?: boolean },
): string {
  if (
    options?.useFormattedAddress &&
    (kind === "address" || kind === "street-address")
  ) {
    const formatted = values.address?.trim() || "";
    if (formatted) {
      return formatted;
    }
  }

  let value = values[kind] ?? "";
  if (!value && kind === "address") {
    value = values.address || values["street-address"] || "";
  }
  if (!value && kind === "email") {
    value = values.email || values.username || "";
  }
  if (!value && kind === "username") {
    // Prefer nickname (mapped to username) over email for personal_data fills.
    value = values.username || values.email || "";
  }
  if (!value && kind === "name") {
    value = [values["given-name"], values["additional-name"], values["family-name"]]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return value;
}

export type FillAutofillValuesOptions = AutofillFillTargetOptions;

/**
 * Fill page inputs from a semantic value map (personal / card / bank / …).
 * Login username/password/otp should go through {@link fillLoginForm} when category is login.
 *
 * Address: separate street/city/state/zip/country/house/apt fields get structured values;
 * a single address / street-address field on the page gets the locale-formatted one-liner.
 */
export function fillAutofillValues(
  root: ParentNode,
  values: Partial<Record<string, string>>,
  options?: FillAutofillValuesOptions,
): number {
  let filled = 0;
  const nodes = Array.from(root.querySelectorAll("input"));
  const addressKindsOnPage = new Set<string>();
  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement)) {
      continue;
    }
    const kind = classifyAutofillInput(collectInputHints(node));
    if (kind && ADDRESS_FILL_KINDS.has(kind) && isAutofillTargetElement(node, kind, options)) {
      addressKindsOnPage.add(kind);
    }
  }
  const soleAddressKind =
    addressKindsOnPage.size === 1 ? [...addressKindsOnPage][0] : undefined;
  const useFormattedAddress =
    soleAddressKind === "address" || soleAddressKind === "street-address";

  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement)) {
      continue;
    }
    const kind = classifyAutofillInput(collectInputHints(node));
    if (!kind) {
      continue;
    }
    if (!isAutofillTargetElement(node, kind, options)) {
      continue;
    }
    const value = resolveAutofillValueForKind(kind, values, { useFormattedAddress });
    if (!value) {
      continue;
    }
    const before = node.value;
    fillInputValue(node, value);
    if (node.value !== before && node.value.length > 0) {
      filled += 1;
    } else if (node.value === value && value.length > 0) {
      filled += 1;
    } else if (digitsOnly(node.value) === digitsOnly(value) && digitsOnly(value).length > 0) {
      filled += 1;
    }
  }
  return filled;
}

export type WatchAutofillFillOptions = {
  timeoutMs?: number;
  /** Semantic kinds to keep trying (default: credit-card). */
  kinds?: readonly string[];
};

/**
 * After filling a card number, exp/cvc often mount or become visible.
 * Keep applying remaining values for a short window (empty targets only).
 */
export function watchAndFillAutofillValues(
  root: ParentNode,
  values: Partial<Record<string, string>>,
  options?: WatchAutofillFillOptions,
): () => void {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const kindFilter = new Set(options?.kinds ?? ["cc-number", "cc-exp", "cc-csc", "cc-name"]);
  const filteredValues: Partial<Record<string, string>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (kindFilter.has(key) && value) {
      filteredValues[key] = value;
    }
  }

  const tryFill = (): number =>
    fillAutofillValues(root, filteredValues, {
      allowHiddenCreditCard: true,
      onlyEmpty: true,
    });

  tryFill();

  const observeTarget =
    root instanceof Document
      ? root.documentElement
      : root instanceof Element
        ? root
        : null;
  if (!observeTarget) {
    return () => undefined;
  }

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      tryFill();
    }, 50);
  });
  observer.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden"],
  });

  const stopTimer = setTimeout(() => {
    observer.disconnect();
    if (idleTimer != null) {
      clearTimeout(idleTimer);
    }
  }, timeoutMs);

  return () => {
    observer.disconnect();
    clearTimeout(stopTimer);
    if (idleTimer != null) {
      clearTimeout(idleTimer);
    }
  };
}

function inputFilled(el: HTMLInputElement): boolean {
  return el.value.trim().length > 0;
}

/** True when every visible login field on the page has a non-empty value. */
export function loginFormReadyToSubmit(root: ParentNode): boolean {
  const fields = findLoginFields(root);
  const all = [...fields.username, ...fields.password, ...fields.otp];
  if (all.length === 0) {
    return false;
  }
  return all.every(inputFilled);
}

function resolveFormForFields(fields: ReturnType<typeof findLoginFields>): HTMLFormElement | null {
  const sample = fields.password[0] ?? fields.username[0] ?? fields.otp[0] ?? null;
  return sample?.form ?? null;
}

export function findSubmitControl(form: HTMLFormElement): HTMLElement | null {
  const explicit = form.querySelector<HTMLElement>(
    'button[type="submit"], input[type="submit"], button:not([type]), [type="submit"]',
  );
  if (explicit && isVisibleFillableElementLike(explicit)) {
    return explicit;
  }
  const buttons = Array.from(form.querySelectorAll("button")).filter((btn) => {
    if (!(btn instanceof HTMLButtonElement)) {
      return false;
    }
    const type = (btn.type || "submit").toLowerCase();
    return type === "submit" && isVisibleFillableElementLike(btn);
  });
  return buttons[0] ?? null;
}

function isVisibleFillableElementLike(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement && el.disabled) {
    return false;
  }
  if (el instanceof HTMLInputElement && el.disabled) {
    return false;
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.visibility === "hidden" || style.display === "none")) {
    return false;
  }
  return el.getClientRects().length > 0;
}

/** Submit the nearest login form when all filled fields look ready. */
export function submitLoginFormIfReady(root: ParentNode): boolean {
  const fields = findLoginFields(root);
  if (!loginFormReadyToSubmit(root)) {
    return false;
  }
  const form = resolveFormForFields(fields);
  if (!form) {
    return false;
  }
  const submitControl = findSubmitControl(form);
  if (submitControl) {
    submitControl.click();
    return true;
  }
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return true;
  }
  form.submit();
  return true;
}

export function fillLoginFormAndMaybeSubmit(
  root: ParentNode,
  payload: { username: string; password: string; totp?: string },
  options?: FillLoginFormOptions,
): { filled: boolean; submitted: boolean } {
  fillLoginForm(root, payload, options);
  const submitted = submitLoginFormIfReady(root);
  return { filled: true, submitted };
}

/** Read username/password currently in the page (for save-password capture). */
export function captureLoginCredentials(root: ParentNode): { username: string; password: string } | null {
  const fields = findLoginFields(root);
  const password = fields.password[0]?.value?.trim() ?? "";
  if (!password) {
    return null;
  }
  const username = fields.username[0]?.value?.trim() ?? "";
  return { username, password };
}
