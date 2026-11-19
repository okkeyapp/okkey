/**
 * Map current classifier output onto metric roles.
 * Hints path imports only autofillFieldClassify + isNewPasswordField (no @okkey/ui).
 * DOM path (findLoginFields) is loaded lazily for local cache evaluation.
 */
import {
  classifyAutofillInput,
  type AutofillInputHints,
} from "../../src/lib/autofillFieldClassify.ts";
import { isNewPasswordField } from "../../src/lib/autofillFormDetect.ts";
import type { AnnotationFieldHints, MetricRole } from "./types.ts";

export function hintsToAutofillInput(hints: AnnotationFieldHints): AutofillInputHints {
  return {
    type: hints.type,
    name: hints.name,
    id: hints.id,
    autocomplete: hints.autocomplete,
    placeholder: hints.placeholder,
    ariaLabel: hints.ariaLabel,
    labelText: hints.labelText,
    inputMode: hints.inputMode,
    maxLength: hints.maxLength,
    role: hints.role,
  };
}

/**
 * Predict a single field role from attribute hints (CI path without HTML cache).
 * Mirrors findLoginFields + isNewPasswordField semantics for one field.
 */
export function predictRoleFromHints(
  hints: AnnotationFieldHints,
  siblingPasswordHints: AnnotationFieldHints[] = [],
): MetricRole | null {
  const input = hintsToAutofillInput(hints);
  const kind = classifyAutofillInput(input);
  if (kind === "otp") {
    return "otp";
  }
  if (kind === "password") {
    const siblings = siblingPasswordHints.map(hintsToAutofillInput);
    if (isNewPasswordField(input, siblings)) {
      return "new-password";
    }
    return "password";
  }
  if (kind === "username" || kind === "email" || kind === "db-username") {
    return "username";
  }
  return null;
}

export type PredictedField = {
  element: HTMLInputElement;
  selector: string;
  role: MetricRole;
};

function cssEscapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/** Best-effort unique selector for an input (id preferred). */
export function selectorForInput(el: HTMLInputElement): string {
  if (el.id) {
    return `#${cssEscapeIdent(el.id)}`;
  }
  const name = el.getAttribute("name");
  const type = (el.type || "text").toLowerCase();
  if (name) {
    return `input[type="${type}"][name="${name.replace(/"/g, '\\"')}"]`;
  }
  const ac = el.getAttribute("autocomplete");
  if (ac) {
    return `input[type="${type}"][autocomplete="${ac.replace(/"/g, '\\"')}"]`;
  }
  const all = Array.from(el.ownerDocument.querySelectorAll("input"));
  const index = all.indexOf(el);
  return `input:nth-of-type(${index + 1})`;
}

/**
 * Run current findLoginFields on a document root and map to metric roles.
 * Lazy-imports loginFormFields so CI hints evaluation does not need @okkey/ui.
 */
export async function predictRolesFromDocument(root: ParentNode): Promise<PredictedField[]> {
  const { collectInputHints, findLoginFields } = await import("../../src/lib/loginFormFields.ts");
  const fields = findLoginFields(root);
  const passwordHints = fields.password.map((el) => collectInputHints(el));
  const predicted: PredictedField[] = [];
  const seen = new Set<HTMLInputElement>();

  for (const el of fields.otp) {
    if (seen.has(el)) {
      continue;
    }
    seen.add(el);
    predicted.push({ element: el, selector: selectorForInput(el), role: "otp" });
  }

  for (const el of fields.username) {
    if (seen.has(el)) {
      continue;
    }
    seen.add(el);
    predicted.push({ element: el, selector: selectorForInput(el), role: "username" });
  }

  for (const el of fields.password) {
    if (seen.has(el)) {
      continue;
    }
    seen.add(el);
    const hints = collectInputHints(el);
    const role: MetricRole = isNewPasswordField(hints, passwordHints) ? "new-password" : "password";
    predicted.push({ element: el, selector: selectorForInput(el), role });
  }

  return predicted;
}
