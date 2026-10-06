export type LoginFieldKind = "username" | "password" | "otp";

const OTP_NAME = /one[-_]?time|otp|totp|2fa|mfa|authenticator|verification[-_]?code|auth[-_]?code|^code$/i;
const USER_NAME = /user(name)?|login|email|e-mail|account|identifier|id$/i;

function attrBlob(el: {
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
}): string {
  return [el.name, el.id, el.autocomplete, el.placeholder, el.ariaLabel].filter(Boolean).join(" ");
}

export function classifyLoginInput(input: {
  type: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  inputMode?: string;
  maxLength?: number;
}): LoginFieldKind | null {
  const type = input.type.toLowerCase();
  const ac = (input.autocomplete ?? "").toLowerCase();
  if (type === "password") {
    if (ac.includes("one-time") || OTP_NAME.test(attrBlob(input))) {
      return "otp";
    }
    return "password";
  }
  if (type === "hidden" || type === "submit" || type === "button" || type === "checkbox" || type === "radio") {
    return null;
  }
  if (
    ac.includes("one-time-code") ||
    ac === "otp" ||
    OTP_NAME.test(attrBlob(input)) ||
    (input.inputMode === "numeric" && (input.maxLength === 6 || input.maxLength === 8) && OTP_NAME.test(attrBlob(input)))
  ) {
    return "otp";
  }
  if (type === "email" || ac.includes("username") || ac.includes("email") || USER_NAME.test(attrBlob(input))) {
    return "username";
  }
  if (type === "text" || type === "tel") {
    return USER_NAME.test(attrBlob(input)) ? "username" : null;
  }
  return null;
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
  return OTP_NAME.test(attrBlob({
    name: input.name,
    id: input.id,
    autocomplete: input.autocomplete,
    placeholder: input.placeholder,
    ariaLabel: input.getAttribute("aria-label") ?? undefined,
  }));
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
    const kind = classifyLoginInput({
      type: node.type,
      name: node.name,
      id: node.id,
      autocomplete: node.autocomplete,
      placeholder: node.placeholder,
      ariaLabel: node.getAttribute("aria-label") ?? undefined,
      inputMode: node.inputMode,
      maxLength: node.maxLength,
    });
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
