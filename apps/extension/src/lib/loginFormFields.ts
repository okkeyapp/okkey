import {
  attrBlob,
  classifyLoginInput as classifyLoginInputImpl,
  collectInputHints,
  type AutofillInputHints,
} from "./autofillFieldClassify.ts";

export type LoginFieldKind = "username" | "password" | "otp";

export {
  classifyAutofillInput,
  collectInputHints,
  collectPageFieldKinds,
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
  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement) || !isVisibleFillableElement(node)) {
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
  if (otp.length <= 1) {
    const digitGroup = collectDigitOtpGroups(
      nodes.filter(
        (node): node is HTMLInputElement =>
          node instanceof HTMLInputElement &&
          isVisibleFillableElement(node) &&
          !classified.has(node),
      ),
    );
    if (digitGroup.length >= 4) {
      otp.push(...digitGroup);
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

export function fillInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Do not focus filled fields: focusing them re-opens the suggestion dropdown.
  if (el.value === value) {
    return;
  }
  const set = nativeValueSetter(el);
  if (set) {
    set(value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
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

function fillOtpFields(otpFields: HTMLInputElement[], totp: string): void {
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
    fillInputValue(el, value);
  }
}

export function fillLoginForm(
  root: ParentNode,
  payload: { username: string; password: string; totp?: string },
): void {
  const fields = findLoginFields(root);
  if (payload.username) {
    for (const el of fields.username) {
      fillInputValue(el, payload.username);
    }
  }
  if (payload.password) {
    for (const el of fields.password) {
      fillInputValue(el, payload.password);
    }
  }
  if (payload.totp) {
    fillOtpFields(fields.otp, payload.totp);
  }
}

/**
 * Fill page inputs from a semantic value map (personal / card / bank / …).
 * Login username/password/otp should go through {@link fillLoginForm} when category is login.
 */
export function fillAutofillValues(
  root: ParentNode,
  values: Partial<Record<string, string>>,
): number {
  let filled = 0;
  const nodes = Array.from(root.querySelectorAll("input"));
  for (const node of nodes) {
    if (!(node instanceof HTMLInputElement) || !isVisibleFillableElement(node)) {
      continue;
    }
    const kind = classifyAutofillInput(collectInputHints(node));
    if (!kind) {
      continue;
    }
    let value = values[kind] ?? "";
    if (!value && (kind === "email" || kind === "username")) {
      value = values.email || values.username || "";
    }
    if (!value && kind === "name") {
      value = [values["given-name"], values["additional-name"], values["family-name"]]
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (!value) {
      continue;
    }
    fillInputValue(node, value);
    filled += 1;
  }
  return filled;
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
): { filled: boolean; submitted: boolean } {
  fillLoginForm(root, payload);
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
