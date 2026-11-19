import type {
  AnnotatedField,
  AnnotatedForm,
  DisagreementEntry,
  FalsePositiveMetrics,
  FormRecognitionMetrics,
  InterfaceLang,
  MetricRole,
  MetricSlice,
  MissEntry,
  PageAnnotation,
  RoleCounts,
  RoleMetrics,
} from "./types.ts";
import { METRIC_ROLES } from "./types.ts";
import { predictRoleFromHints } from "./predict.ts";

export type AgreedField = {
  pageId: string;
  url: string;
  lang: InterfaceLang;
  pageKind: PageAnnotation["pageKind"];
  formId: string;
  selector: string;
  role: MetricRole;
  hints?: AnnotatedField["hints"];
};

export type AgreedForm = {
  pageId: string;
  url: string;
  lang: InterfaceLang;
  pageKind: PageAnnotation["pageKind"];
  formId: string;
  fields: AgreedField[];
};

function emptyCounts(): RoleCounts {
  return { tp: 0, fp: 0, fn: 0 };
}

function emptyPerRole(): Record<MetricRole, RoleCounts> {
  return {
    username: emptyCounts(),
    password: emptyCounts(),
    "new-password": emptyCounts(),
    otp: emptyCounts(),
  };
}

function ratio(numerator: number, denominator: number): number | "no data" {
  if (denominator === 0) {
    return "no data";
  }
  return numerator / denominator;
}

function f1Score(precision: number | "no data", recall: number | "no data"): number | "no data" {
  if (precision === "no data" || recall === "no data") {
    return "no data";
  }
  if (precision + recall === 0) {
    return "no data";
  }
  return (2 * precision * recall) / (precision + recall);
}

export function roleMetricsFromCounts(counts: RoleCounts): RoleMetrics {
  const precision = ratio(counts.tp, counts.tp + counts.fp);
  const recall = ratio(counts.tp, counts.tp + counts.fn);
  return {
    precision,
    recall,
    f1: f1Score(precision, recall),
    counts: { ...counts },
  };
}

function fieldKey(formId: string, selector: string): string {
  return `${formId}::${selector}`;
}

function indexFields(forms: AnnotatedForm[]): Map<string, AnnotatedField & { formId: string }> {
  const map = new Map<string, AnnotatedField & { formId: string }>();
  for (const form of forms) {
    for (const field of form.fields) {
      map.set(fieldKey(form.formId, field.selector), { ...field, formId: form.formId });
    }
  }
  return map;
}

/**
 * Build the agreement set: fields/forms enter the denominator only when A and B agree.
 * Disagreements are listed separately and excluded from metrics.
 */
export function buildAgreement(
  a: PageAnnotation,
  b: PageAnnotation,
): {
  forms: AgreedForm[];
  fields: AgreedField[];
  disagreements: DisagreementEntry[];
} {
  const disagreements: DisagreementEntry[] = [];
  const fields: AgreedField[] = [];
  const forms: AgreedForm[] = [];

  if (a.status !== "annotated" || b.status !== "annotated") {
    return { forms, fields, disagreements };
  }

  const aFields = indexFields(a.forms);
  const bFields = indexFields(b.forms);
  const keys = new Set([...aFields.keys(), ...bFields.keys()]);

  const agreedByForm = new Map<string, AgreedField[]>();

  for (const key of keys) {
    const af = aFields.get(key);
    const bf = bFields.get(key);
    if (!af || !bf) {
      disagreements.push({
        pageId: a.pageId,
        url: a.url,
        formId: af?.formId ?? bf?.formId,
        selector: af?.selector ?? bf?.selector,
        annotatorA: af?.role ?? null,
        annotatorB: bf?.role ?? null,
        reason: !af ? "missing-in-A" : "missing-in-B",
      });
      continue;
    }
    if (af.role !== bf.role) {
      disagreements.push({
        pageId: a.pageId,
        url: a.url,
        formId: af.formId,
        selector: af.selector,
        annotatorA: af.role,
        annotatorB: bf.role,
        reason: "role-mismatch",
      });
      continue;
    }
    const agreed: AgreedField = {
      pageId: a.pageId,
      url: a.url,
      lang: a.lang,
      pageKind: a.pageKind,
      formId: af.formId,
      selector: af.selector,
      role: af.role,
      hints: af.hints ?? bf.hints,
    };
    fields.push(agreed);
    const list = agreedByForm.get(af.formId) ?? [];
    list.push(agreed);
    agreedByForm.set(af.formId, list);
  }

  // A form enters the denominator only when every field on that form (from either annotator)
  // agreed — i.e. no disagreement touched the form, and both listed the same formId with
  // the same field set.
  const aFormIds = new Set(a.forms.map((form) => form.formId));
  const bFormIds = new Set(b.forms.map((form) => form.formId));
  for (const formId of aFormIds) {
    if (!bFormIds.has(formId)) {
      disagreements.push({
        pageId: a.pageId,
        url: a.url,
        formId,
        reason: "form-missing-in-B",
      });
      agreedByForm.delete(formId);
      continue;
    }
    const aForm = a.forms.find((form) => form.formId === formId)!;
    const bForm = b.forms.find((form) => form.formId === formId)!;
    const aSelectors = new Set(aForm.fields.map((field) => field.selector));
    const bSelectors = new Set(bForm.fields.map((field) => field.selector));
    const sameSet =
      aSelectors.size === bSelectors.size && [...aSelectors].every((sel) => bSelectors.has(sel));
    if (!sameSet) {
      disagreements.push({
        pageId: a.pageId,
        url: a.url,
        formId,
        reason: "form-field-set-mismatch",
      });
      agreedByForm.delete(formId);
      continue;
    }
    // Any field-level disagreement already removed keys; if counts differ, skip form.
    const agreedFields = agreedByForm.get(formId) ?? [];
    if (agreedFields.length !== aForm.fields.length) {
      agreedByForm.delete(formId);
      continue;
    }
    forms.push({
      pageId: a.pageId,
      url: a.url,
      lang: a.lang,
      pageKind: a.pageKind,
      formId,
      fields: agreedFields,
    });
  }
  for (const formId of bFormIds) {
    if (!aFormIds.has(formId)) {
      disagreements.push({
        pageId: a.pageId,
        url: a.url,
        formId,
        reason: "form-missing-in-A",
      });
    }
  }

  return { forms, fields, disagreements };
}

export type PredictionMap = Map<string, MetricRole>; // key: formId::selector OR pageId::selector

/**
 * Predict roles for agreed fields from embedded hints (CI-safe, no HTML).
 */
export function predictRolesForAgreedFields(fields: AgreedField[]): PredictionMap {
  const byForm = new Map<string, AgreedField[]>();
  for (const field of fields) {
    const key = `${field.pageId}::${field.formId}`;
    const list = byForm.get(key) ?? [];
    list.push(field);
    byForm.set(key, list);
  }

  const predictions = new Map<string, MetricRole>();
  for (const group of byForm.values()) {
    const passwordHints = group
      .map((field) => field.hints)
      .filter((hints): hints is NonNullable<typeof hints> => Boolean(hints))
      .filter((hints) => (hints.type || "").toLowerCase() === "password");

    for (const field of group) {
      if (!field.hints) {
        continue;
      }
      const role = predictRoleFromHints(field.hints, passwordHints);
      if (role) {
        predictions.set(`${field.pageId}::${fieldKey(field.formId, field.selector)}`, role);
      }
    }
  }
  return predictions;
}

/**
 * (a) Form fully recognized: every annotated role is assigned to exactly the annotated field
 * and no extra role from the set is assigned to any field of the form.
 * Identifier-only step: identifier found and no password role assigned.
 */
export function isFormFullyRecognized(
  form: AgreedForm,
  predictedByKey: Map<string, MetricRole>,
): boolean {
  const annotatedRoles = new Map<string, MetricRole>();
  for (const field of form.fields) {
    annotatedRoles.set(field.selector, field.role);
  }

  const predictedOnForm = new Map<string, MetricRole>();
  for (const field of form.fields) {
    const key = `${form.pageId}::${fieldKey(form.formId, field.selector)}`;
    const role = predictedByKey.get(key);
    if (role) {
      predictedOnForm.set(field.selector, role);
    }
  }

  // Also consider predictions on selectors that were annotated — already covered.
  // Extra roles: any predicted role on an annotated field that doesn't match, OR
  // if we only have annotated field predictions (hints path), check role equality.

  for (const [selector, expected] of annotatedRoles) {
    const got = predictedOnForm.get(selector);
    if (got !== expected) {
      return false;
    }
  }

  // No extra metric role on any annotated field beyond the agreed mapping.
  for (const [selector, got] of predictedOnForm) {
    const expected = annotatedRoles.get(selector);
    if (expected === undefined) {
      // Extra field with a metric role on the form.
      return false;
    }
    if (expected !== got) {
      return false;
    }
  }

  // Identifier-only: if annotated roles are only username (no password/new-password/otp),
  // require username found and no password role predicted on the form.
  const roleSet = new Set(annotatedRoles.values());
  const identifierOnly =
    roleSet.has("username") &&
    !roleSet.has("password") &&
    !roleSet.has("new-password") &&
    !roleSet.has("otp");
  if (identifierOnly) {
    const hasUsername = [...predictedOnForm.values()].includes("username");
    const hasPasswordRole = [...predictedOnForm.values()].some(
      (role) => role === "password" || role === "new-password",
    );
    return hasUsername && !hasPasswordRole;
  }

  return annotatedRoles.size > 0;
}

function formRecognitionMetrics(
  forms: AgreedForm[],
  predictedByKey: Map<string, MetricRole>,
): FormRecognitionMetrics {
  // Forms with no metric-role fields (e.g. search/checkout shells) are out of (a).
  const eligible = forms.filter((form) => form.fields.length > 0);
  if (eligible.length === 0) {
    return { fullyRecognized: 0, annotatedForms: 0, share: "no data" };
  }
  let fully = 0;
  for (const form of eligible) {
    if (isFormFullyRecognized(form, predictedByKey)) {
      fully += 1;
    }
  }
  return {
    fullyRecognized: fully,
    annotatedForms: eligible.length,
    share: fully / eligible.length,
  };
}

function perRoleMetrics(
  fields: AgreedField[],
  predictedByKey: Map<string, MetricRole>,
  misses: MissEntry[],
): Record<MetricRole, RoleMetrics> {
  const counts = emptyPerRole();
  if (fields.length === 0) {
    return {
      username: roleMetricsFromCounts(counts.username),
      password: roleMetricsFromCounts(counts.password),
      "new-password": roleMetricsFromCounts(counts["new-password"]),
      otp: roleMetricsFromCounts(counts.otp),
    };
  }

  for (const role of METRIC_ROLES) {
    const annotated = fields.filter((field) => field.role === role);
    const predictedKeys = new Set<string>();
    for (const field of fields) {
      const key = `${field.pageId}::${fieldKey(field.formId, field.selector)}`;
      if (predictedByKey.get(key) === role) {
        predictedKeys.add(key);
      }
    }

    for (const field of annotated) {
      const key = `${field.pageId}::${fieldKey(field.formId, field.selector)}`;
      if (predictedByKey.get(key) === role) {
        counts[role].tp += 1;
        predictedKeys.delete(key);
      } else {
        counts[role].fn += 1;
        misses.push({
          pageId: field.pageId,
          url: field.url,
          role,
          kind: "fn",
          selector: field.selector,
        });
      }
    }

    // Remaining predicted keys of this role on agreed fields that were annotated differently → FP
    for (const key of predictedKeys) {
      counts[role].fp += 1;
      const field = fields.find(
        (candidate) => `${candidate.pageId}::${fieldKey(candidate.formId, candidate.selector)}` === key,
      );
      if (field) {
        misses.push({
          pageId: field.pageId,
          url: field.url,
          role,
          kind: "fp",
          selector: field.selector,
        });
      }
    }
  }

  return {
    username: roleMetricsFromCounts(counts.username),
    password: roleMetricsFromCounts(counts.password),
    "new-password": roleMetricsFromCounts(counts["new-password"]),
    otp: roleMetricsFromCounts(counts.otp),
  };
}

/**
 * (c) False positives on non-login pages (search, checkout):
 * share of pages where any of the 4 roles was assigned, plus field count.
 * A card field on checkout is not a false positive by itself (only the 4 metric roles count).
 */
export function falsePositiveMetrics(
  pages: Array<{
    pageId: string;
    pageKind: PageAnnotation["pageKind"];
    predictedRoles: MetricRole[];
  }>,
): FalsePositiveMetrics {
  const nonLogin = pages.filter(
    (page) => page.pageKind === "search" || page.pageKind === "checkout",
  );
  if (nonLogin.length === 0) {
    return { pagesEvaluated: 0, pagesWithAnyRole: 0, share: "no data", fieldCount: 0 };
  }
  let pagesWithAnyRole = 0;
  let fieldCount = 0;
  for (const page of nonLogin) {
    const roles = page.predictedRoles.filter((role) =>
      (METRIC_ROLES as readonly string[]).includes(role),
    );
    if (roles.length > 0) {
      pagesWithAnyRole += 1;
      fieldCount += roles.length;
    }
  }
  return {
    pagesEvaluated: nonLogin.length,
    pagesWithAnyRole,
    share: pagesWithAnyRole / nonLogin.length,
    fieldCount,
  };
}

export function buildMetricSlice(
  forms: AgreedForm[],
  fields: AgreedField[],
  predictedByKey: Map<string, MetricRole>,
  fpPages: Array<{
    pageId: string;
    pageKind: PageAnnotation["pageKind"];
    predictedRoles: MetricRole[];
  }>,
  misses: MissEntry[],
): MetricSlice {
  return {
    formRecognition: formRecognitionMetrics(forms, predictedByKey),
    perRole: perRoleMetrics(fields, predictedByKey, misses),
    falsePositives: falsePositiveMetrics(fpPages),
  };
}

export function emptyMetricSlice(): MetricSlice {
  return {
    formRecognition: { fullyRecognized: 0, annotatedForms: 0, share: "no data" },
    perRole: {
      username: roleMetricsFromCounts(emptyCounts()),
      password: roleMetricsFromCounts(emptyCounts()),
      "new-password": roleMetricsFromCounts(emptyCounts()),
      otp: roleMetricsFromCounts(emptyCounts()),
    },
    falsePositives: { pagesEvaluated: 0, pagesWithAnyRole: 0, share: "no data", fieldCount: 0 },
  };
}
