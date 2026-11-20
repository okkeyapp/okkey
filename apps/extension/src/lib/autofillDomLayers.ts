/**
 * DOM extraction layers for autofill: orphan fields, nested forms, visibility,
 * open shadow roots. Closed shadow DOM and payment cross-origin iframes are out of scope.
 */

import { queryAutofillInputs } from "./autofillFieldClassify.ts";

export type AutofillFieldGroup = {
  /** Containing `<form>`, or null for an orphan logical group. */
  form: HTMLFormElement | null;
  /** Fields belonging to this logical form (visible candidates only when filtered). */
  inputs: HTMLInputElement[];
  /** True when fields sit outside any `<form>`. */
  orphan: boolean;
  /** True when this `<form>` is nested inside another `<form>`. */
  nested: boolean;
};

/**
 * Visibility checks used before fill. Hidden / zero-size / off-screen / aria-hidden
 * fields must never receive values.
 */
export function isElementVisiblyFillable(
  el: HTMLInputElement | HTMLTextAreaElement,
  options?: { allowZeroOpacityParent?: boolean },
): boolean {
  if (el.disabled || el.readOnly) {
    return false;
  }
  if ((el instanceof HTMLInputElement && el.type.toLowerCase() === "hidden") || el.hidden) {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") {
    return false;
  }
  // Walk ancestors for aria-hidden / inert.
  let ancestor: Element | null = el.parentElement;
  while (ancestor) {
    if (ancestor.getAttribute?.("aria-hidden") === "true") {
      return false;
    }
    if (ancestor.hasAttribute?.("inert")) {
      return false;
    }
    ancestor = ancestor.parentElement;
  }

  const view = el.ownerDocument.defaultView;
  const style = view?.getComputedStyle(el);
  if (style) {
    if (style.visibility === "hidden" || style.display === "none") {
      return false;
    }
    const opacity = Number.parseFloat(style.opacity || "1");
    if (!options?.allowZeroOpacityParent && Number.isFinite(opacity) && opacity === 0) {
      return false;
    }
    const rects = el.getClientRects();
    if (rects.length === 0) {
      return false;
    }
    const rect = rects[0];
    if (!rect || rect.width < 1 || rect.height < 1) {
      return false;
    }
    // Off-screen: far outside the viewport (common honeypot / collapsed patterns).
    if (view) {
      const vw = view.innerWidth || view.document.documentElement.clientWidth || 0;
      const vh = view.innerHeight || view.document.documentElement.clientHeight || 0;
      if (
        rect.right < -50 ||
        rect.bottom < -50 ||
        (vw > 0 && rect.left > vw + 50) ||
        (vh > 0 && rect.top > vh + 50)
      ) {
        return false;
      }
    }
  } else if (el.getClientRects().length === 0) {
    return false;
  }
  return true;
}

/**
 * Extract logical field groups: each nested form separately, then top-level forms,
 * then orphan inputs (no `<form>` ancestor) as one logical group when present.
 *
 * Walks open shadow roots via {@link queryAutofillInputs}.
 */
export function extractAutofillFieldGroups(root: ParentNode): AutofillFieldGroup[] {
  const allInputs = queryAutofillInputs(root);
  const forms = collectForms(root);
  const assigned = new Set<HTMLInputElement>();
  const groups: AutofillFieldGroup[] = [];

  // Nested forms first (deepest), then remaining forms.
  const orderedForms = [...forms].sort((a, b) => depth(b) - depth(a));
  for (const form of orderedForms) {
    const inputs = allInputs.filter((input) => {
      if (assigned.has(input)) {
        return false;
      }
      const owner = input.form ?? closestForm(input);
      return owner === form;
    });
    if (inputs.length === 0) {
      continue;
    }
    for (const input of inputs) {
      assigned.add(input);
    }
    const nested = Boolean(form.parentElement && closestForm(form.parentElement));
    groups.push({ form, inputs, orphan: false, nested });
  }

  const orphans = allInputs.filter((input) => {
    if (assigned.has(input)) {
      return false;
    }
    return !input.form && !closestForm(input);
  });
  if (orphans.length > 0) {
    groups.push({ form: null, inputs: orphans, orphan: true, nested: false });
  }

  return groups;
}

function collectForms(root: ParentNode): HTMLFormElement[] {
  const found: HTMLFormElement[] = [];
  const visit = (node: ParentNode): void => {
    const list =
      typeof (node as ParentNode & { querySelectorAll?: unknown }).querySelectorAll === "function"
        ? Array.from((node as ParentNode).querySelectorAll("form"))
        : [];
    for (const el of list) {
      if (el instanceof HTMLFormElement) {
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

function closestForm(el: Element): HTMLFormElement | null {
  try {
    const found = el.closest("form");
    return found instanceof HTMLFormElement ? found : null;
  } catch {
    return null;
  }
}

function depth(el: Element): number {
  let n = 0;
  let cur: Element | null = el;
  while (cur) {
    n += 1;
    cur = cur.parentElement;
  }
  return n;
}

/**
 * True when `frame` (or current window) is a cross-origin descendant of `top`.
 * Accessing `top.location` throws when origins differ — that throw means foreign.
 */
export function isForeignOriginFrame(
  frameWindow: Window | null | undefined = typeof window !== "undefined" ? window : undefined,
): boolean {
  if (!frameWindow) {
    return false;
  }
  try {
    const topWin = frameWindow.top;
    if (!topWin || topWin === frameWindow) {
      return false;
    }
    // Same-origin access succeeds; compare origins explicitly.
    const frameOrigin = frameWindow.location.origin;
    const topOrigin = topWin.location.origin;
    return frameOrigin !== topOrigin;
  } catch {
    // Cross-origin frame: browser blocks top.location → treat as foreign.
    return true;
  }
}

/**
 * Security gate: never fill a foreign-origin frame with values intended for another site.
 * Same-origin iframes (and the top frame) are allowed.
 */
export function assertSameOriginFillAllowed(
  frameWindow: Window | null | undefined = typeof window !== "undefined" ? window : undefined,
): boolean {
  return !isForeignOriginFrame(frameWindow);
}
