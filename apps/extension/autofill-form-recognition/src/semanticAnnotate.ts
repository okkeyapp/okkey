/**
 * Independent HTML5 / semantic annotation helper for annotator A.
 * Does NOT call classifyAutofillInput / findLoginFields — ground truth must stay
 * independent of the classifier under test.
 */
import type {
  AnnotatedField,
  AnnotatedForm,
  AnnotationFieldHints,
  CorpusPageKind,
  InterfaceLang,
  MetricRole,
  PageAnnotation,
} from "./types.ts";

function acParts(autocomplete: string | undefined): string[] {
  return (autocomplete ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasAc(parts: string[], token: string): boolean {
  return parts.some(
    (part) => part === token || part.endsWith(`-${token}`) || part.startsWith(`${token}-`),
  );
}

function blobOf(hints: AnnotationFieldHints): string {
  return [hints.name, hints.id, hints.placeholder, hints.ariaLabel, hints.labelText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Map a single field to a metric role using HTML autocomplete + type semantics.
 * Email used to log in → username. Confirm/repeat password is not annotated as a
 * metric role (only current vs new password).
 */
export function semanticRoleForHints(hints: AnnotationFieldHints): MetricRole | null {
  const type = (hints.type || "text").toLowerCase();
  const parts = acParts(hints.autocomplete);
  const blob = blobOf(hints);

  if (
    hasAc(parts, "one-time-code") ||
    parts.includes("one-time-code") ||
    /\b(otp|totp|2fa|mfa|one[-_\s]?time|verification[-_\s]?code|auth[-_\s]?code)\b/i.test(blob)
  ) {
    return "otp";
  }

  if (type === "password") {
    if (hasAc(parts, "new-password") || /\b(new[-_\s]?password|create[-_\s]?password|choose[-_\s]?password|set[-_\s]?password)\b/i.test(blob)) {
      return "new-password";
    }
    if (/\b(confirm|repeat|re[-_]?type|re[-_]?enter|verify|подтверд|повтор)\b/i.test(blob)) {
      // Confirm field: still a new-password context on register forms; annotate as new-password
      // only when autocomplete says so — otherwise skip (not in the 4-role set as confirm).
      return null;
    }
    return "password";
  }

  if (
    type === "email" ||
    hasAc(parts, "email") ||
    hasAc(parts, "username") ||
    /\b(username|user[-_]?name|login|email|e[-_]?mail|логин|пользовател|почт)\b/i.test(blob)
  ) {
    return "username";
  }

  if (
    (type === "tel" || hasAc(parts, "tel") || /\b(phone|mobile|телефон)\b/i.test(blob)) &&
    !/\b(search|otp|code)\b/i.test(blob)
  ) {
    // Phone-as-login-id on RU marketplaces — annotators mark as username.
    return "username";
  }

  return null;
}

export type SnapshotInput = {
  selector: string;
  hints: AnnotationFieldHints;
  formSelector: string | null;
};

export function buildAnnotatorAFromSnapshots(options: {
  pageId: string;
  url: string;
  lang: InterfaceLang;
  pageKind: CorpusPageKind;
  snapshots: SnapshotInput[];
  notes?: string;
}): PageAnnotation {
  const formMap = new Map<string, AnnotatedField[]>();
  for (const snap of options.snapshots) {
    const role = semanticRoleForHints(snap.hints);
    if (!role) {
      continue;
    }
    const formKey = snap.formSelector ?? "__orphan__";
    const list = formMap.get(formKey) ?? [];
    list.push({
      selector: snap.selector,
      role,
      hints: snap.hints,
    });
    formMap.set(formKey, list);
  }

  const forms: AnnotatedForm[] = [];
  let index = 0;
  for (const [formKey, fields] of formMap) {
    if (fields.length === 0) {
      continue;
    }
    index += 1;
    forms.push({
      formId: `form-${index}`,
      selector: formKey === "__orphan__" ? null : formKey,
      fields,
    });
  }

  return {
    schemaVersion: 1,
    pageId: options.pageId,
    url: options.url,
    lang: options.lang,
    annotator: "A",
    status: forms.length > 0 ? "annotated" : "uncapturable",
    pageKind: options.pageKind,
    forms,
    notes: options.notes,
  };
}

export function inferPageKind(formTypes: string[], url: string): CorpusPageKind {
  const urlLower = url.toLowerCase();
  const joined = `${formTypes.join(";")} ${urlLower}`;
  if (/\bsearch\b|\/search|\/catalog|\/s\?/.test(joined)) {
    return "search";
  }
  if (/\bcheckout\b|\/cart|\/basket|\/pay|\/payment/.test(joined)) {
    return "checkout";
  }
  // Prefer URL path over the full form_types list (rows often list many expected types).
  if (/\/login|\/signin|\/sign-in|userlogin|\/auth\b|\/session|\/sign_in/.test(urlLower)) {
    return "login";
  }
  if (/\/register|\/signup|\/sign-up|\/create-account|\/registration/.test(urlLower)) {
    return "register";
  }
  if (/\bregister\b|signup|sign-up|registration/.test(formTypes.join(";").toLowerCase()) && !/\blogin\b/.test(formTypes.join(";").toLowerCase())) {
    return "register";
  }
  return "login";
}
