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

export function findLoginFields(root: ParentNode): {
  username: HTMLInputElement[];
  password: HTMLInputElement[];
  otp: HTMLInputElement[];
} {
  const username: HTMLInputElement[] = [];
  const password: HTMLInputElement[] = [];
  const otp: HTMLInputElement[] = [];
  const nodes = Array.from(root.querySelectorAll("input"));
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
    } else if (kind === "password") {
      password.push(node);
    } else if (kind === "otp") {
      otp.push(node);
    }
  }
  return { username, password, otp };
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
  el.focus();
  const set = nativeValueSetter(el);
  if (set) {
    set(value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
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
    for (const el of fields.otp) {
      fillInputValue(el, payload.totp);
    }
  }
}
