import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  loadAllAnnotationPairs,
  loadAnnotationPair,
  listAnnotationPageIds,
  validateAllAnnotations,
} from "./annotations.ts";
import { computeClassifierFingerprint } from "./classifier-fingerprint.ts";
import {
  buildAgreement,
  buildMetricSlice,
  emptyMetricSlice,
  predictRolesForAgreedFields,
  type AgreedField,
  type AgreedForm,
} from "./metrics.ts";
import { CAPTURE_STATUS_FILE, FIXTURES_DIR } from "./paths.ts";
import { loadCorpusSites, pageIdForSite } from "./sites.ts";
import type {
  CaptureStatusEntry,
  DisagreementEntry,
  InterfaceLang,
  MetricRole,
  MetricsReport,
  MissEntry,
  PageAnnotation,
} from "./types.ts";

function filterByLang<T extends { lang: InterfaceLang }>(items: T[], lang: InterfaceLang): T[] {
  return items.filter((item) => item.lang === lang);
}

function fpPagesFromAgreed(
  fields: AgreedField[],
  predictedByKey: Map<string, MetricRole>,
  pairs: Array<{ a: PageAnnotation | null; b: PageAnnotation | null }>,
): Array<{ pageId: string; pageKind: PageAnnotation["pageKind"]; predictedRoles: MetricRole[] }> {
  // For search/checkout pages that have agreement, use predicted roles on agreed fields.
  const byPage = new Map<
    string,
    { pageKind: PageAnnotation["pageKind"]; predictedRoles: MetricRole[] }
  >();

  for (const field of fields) {
    if (field.pageKind !== "search" && field.pageKind !== "checkout") {
      continue;
    }
    const key = `${field.pageId}::${field.formId}::${field.selector}`;
    // predicted map uses pageId::formId::selector via fieldKey helper inside predictRolesForAgreedFields
    const predKey = `${field.pageId}::${field.formId}::${field.selector}`;
    // Our PredictionMap keys are `${pageId}::${formId}::${selector}` where formId::selector is fieldKey
    // fieldKey = formId::selector, full = pageId::formId::selector — matches predKey with :: joining.
    void key;
    const role = predictedByKey.get(`${field.pageId}::${field.formId}::${field.selector}`);
    const entry = byPage.get(field.pageId) ?? {
      pageKind: field.pageKind,
      predictedRoles: [],
    };
    if (role) {
      entry.predictedRoles.push(role);
    }
    byPage.set(field.pageId, entry);
  }

  // Also include agreed search/checkout pages with zero predicted roles.
  for (const pair of pairs) {
    const a = pair.a;
    const b = pair.b;
    if (!a || !b || a.status !== "annotated" || b.status !== "annotated") {
      continue;
    }
    if (a.pageKind !== "search" && a.pageKind !== "checkout") {
      continue;
    }
    if (!byPage.has(a.pageId)) {
      byPage.set(a.pageId, { pageKind: a.pageKind, predictedRoles: [] });
    }
  }

  return [...byPage.entries()].map(([pageId, value]) => ({ pageId, ...value }));
}

export function evaluateAnnotations(
  pairs = loadAllAnnotationPairs(),
): {
  forms: AgreedForm[];
  fields: AgreedField[];
  disagreements: DisagreementEntry[];
  predictedByKey: Map<string, MetricRole>;
} {
  const forms: AgreedForm[] = [];
  const fields: AgreedField[] = [];
  const disagreements: DisagreementEntry[] = [];

  for (const pair of pairs) {
    if (!pair.a || !pair.b) {
      continue;
    }
    const agreement = buildAgreement(pair.a, pair.b);
    forms.push(...agreement.forms);
    fields.push(...agreement.fields);
    disagreements.push(...agreement.disagreements);
  }

  const predictedByKey = predictRolesForAgreedFields(fields);
  return { forms, fields, disagreements, predictedByKey };
}

export function buildMetricsReport(options?: {
  pairs?: ReturnType<typeof loadAllAnnotationPairs>;
  captureStatus?: CaptureStatusEntry[];
}): MetricsReport {
  const pairs = options?.pairs ?? loadAllAnnotationPairs();
  const { forms, fields, disagreements, predictedByKey } = evaluateAnnotations(pairs);
  const misses: MissEntry[] = [];

  const fpPages = fpPagesFromAgreed(fields, predictedByKey, pairs);

  const overall = forms.length === 0 && fields.length === 0
    ? {
        ...emptyMetricSlice(),
        falsePositives: buildMetricSlice([], [], predictedByKey, fpPages, []).falsePositives,
      }
    : buildMetricSlice(forms, fields, predictedByKey, fpPages, misses);

  // Rebuild misses cleanly per slice — overall already filled misses; clone for lang slices.
  const missesOverall = [...misses];

  const byLang = {} as MetricsReport["byLang"];
  for (const lang of ["RU", "EN"] as InterfaceLang[]) {
    const langMisses: MissEntry[] = [];
    const langForms = filterByLang(forms, lang);
    const langFields = filterByLang(fields, lang);
    const langFp = fpPages.filter((page) => {
      const pair = pairs.find((candidate) => candidate.pageId === page.pageId);
      return pair?.a?.lang === lang;
    });
    byLang[lang] =
      langForms.length === 0 && langFields.length === 0
        ? {
            ...emptyMetricSlice(),
            falsePositives: buildMetricSlice([], [], predictedByKey, langFp, []).falsePositives,
          }
        : buildMetricSlice(langForms, langFields, predictedByKey, langFp, langMisses);
  }

  const fingerprint = computeClassifierFingerprint();
  const sites = loadCorpusSites();
  const captureStatus =
    options?.captureStatus ??
    (existsSync(CAPTURE_STATUS_FILE)
      ? (JSON.parse(readFileSync(CAPTURE_STATUS_FILE, "utf8")) as CaptureStatusEntry[])
      : []);

  const pagesWithA = pairs.filter((pair) => pair.a?.status === "annotated").length;
  const pagesWithB = pairs.filter((pair) => pair.b?.status === "annotated").length;
  const pagesWithAgreement = new Set(forms.map((form) => form.pageId)).size;
  const blocked = pairs.filter(
    (pair) =>
      pair.a?.status === "blocked" ||
      pair.a?.status === "uncapturable" ||
      pair.b?.status === "blocked" ||
      pair.b?.status === "uncapturable",
  ).length;

  let syntheticFixturePages = 0;
  if (existsSync(FIXTURES_DIR)) {
    // Count annotation pageIds that start with "fixture-"
    syntheticFixturePages = listAnnotationPageIds().filter((id) => id.startsWith("fixture-")).length;
  }

  const captureSummary = captureStatus.length
    ? {
        captured: captureStatus.filter((row) => row.status === "captured").length,
        blocked: captureStatus.filter((row) => row.status === "blocked").length,
        timeout: captureStatus.filter((row) => row.status === "timeout").length,
        error: captureStatus.filter((row) => row.status === "error").length,
        skipped: captureStatus.filter((row) => row.status === "skipped").length,
      }
    : undefined;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classifierSha: fingerprint.sha256,
    classifierFiles: fingerprint.files.map((file) => path.basename(file.path)),
    runComposition: {
      corpusSites: sites.length,
      pagesWithAnnotatorA: pagesWithA,
      pagesWithAnnotatorB: pagesWithB,
      pagesWithAgreement,
      pagesBlockedOrUncapturable: blocked,
      syntheticFixturePages,
    },
    overall,
    byLang,
    disagreements,
    misses: missesOverall,
    captureSummary,
  };
}

export function formatMetricValue(value: number | "no data"): string {
  if (value === "no data") {
    return "no data";
  }
  return value.toFixed(4);
}

export function printReportSummary(report: MetricsReport): string {
  const lines: string[] = [];
  lines.push(`classifierSha: ${report.classifierSha}`);
  lines.push(
    `composition: sites=${report.runComposition.corpusSites} A=${report.runComposition.pagesWithAnnotatorA} B=${report.runComposition.pagesWithAnnotatorB} agreement=${report.runComposition.pagesWithAgreement}`,
  );
  const slice = report.overall;
  lines.push(
    `(a) form fully recognized: ${formatMetricValue(slice.formRecognition.share)} (${slice.formRecognition.fullyRecognized}/${slice.formRecognition.annotatedForms})`,
  );
  for (const role of ["username", "password", "new-password", "otp"] as MetricRole[]) {
    const m = slice.perRole[role];
    lines.push(
      `(b) ${role}: P=${formatMetricValue(m.precision)} R=${formatMetricValue(m.recall)} F1=${formatMetricValue(m.f1)}`,
    );
  }
  lines.push(
    `(c) FP non-login: ${formatMetricValue(slice.falsePositives.share)} (pages=${slice.falsePositives.pagesWithAnyRole}/${slice.falsePositives.pagesEvaluated}, fields=${slice.falsePositives.fieldCount})`,
  );
  lines.push(
    `(d) RU (a): ${formatMetricValue(report.byLang.RU.formRecognition.share)} | EN (a): ${formatMetricValue(report.byLang.EN.formRecognition.share)}`,
  );
  return lines.join("\n");
}

export { loadAnnotationPair, pageIdForSite, validateAllAnnotations };
