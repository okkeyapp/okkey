import type { InterfaceLang, MetricRole, MetricSlice, MetricsReport } from "./types.ts";
import { METRIC_ROLES } from "./types.ts";

export type Regression = {
  path: string;
  baseline: number | "no data";
  current: number | "no data";
  detail: string;
};

function isWorseHigherBetter(
  baseline: number | "no data",
  current: number | "no data",
): boolean {
  if (baseline === "no data" && current === "no data") {
    return false;
  }
  if (baseline === "no data" && current !== "no data") {
    // Gaining data is not a regression by itself; threshold tracks numeric worsening only
    // once a baseline number exists.
    return false;
  }
  if (baseline !== "no data" && current === "no data") {
    // Losing measurable data after it existed is treated as worse.
    return true;
  }
  return (current as number) < (baseline as number);
}

function isWorseLowerBetter(
  baseline: number | "no data",
  current: number | "no data",
): boolean {
  if (baseline === "no data" && current === "no data") {
    return false;
  }
  if (baseline === "no data" && current !== "no data") {
    return false;
  }
  if (baseline !== "no data" && current === "no data") {
    return true;
  }
  return (current as number) > (baseline as number);
}

function compareSlice(
  prefix: string,
  baseline: MetricSlice,
  current: MetricSlice,
): Regression[] {
  const regressions: Regression[] = [];

  // (a) form recognition share — higher is better
  if (isWorseHigherBetter(baseline.formRecognition.share, current.formRecognition.share)) {
    regressions.push({
      path: `${prefix}.formRecognition.share`,
      baseline: baseline.formRecognition.share,
      current: current.formRecognition.share,
      detail: "form fully-recognized share worsened",
    });
  }

  // (b) per-role precision / recall / F1 — higher is better
  for (const role of METRIC_ROLES as MetricRole[]) {
    for (const key of ["precision", "recall", "f1"] as const) {
      const b = baseline.perRole[role][key];
      const c = current.perRole[role][key];
      if (isWorseHigherBetter(b, c)) {
        regressions.push({
          path: `${prefix}.perRole.${role}.${key}`,
          baseline: b,
          current: c,
          detail: `${role} ${key} worsened`,
        });
      }
    }
  }

  // (c) false-positive share — higher is worse
  if (isWorseLowerBetter(baseline.falsePositives.share, current.falsePositives.share)) {
    regressions.push({
      path: `${prefix}.falsePositives.share`,
      baseline: baseline.falsePositives.share,
      current: current.falsePositives.share,
      detail: "non-login false-positive share worsened",
    });
  }

  return regressions;
}

/**
 * Fail if (a), any (b) precision/recall/F1, (c), or the RU slice gets worse.
 * Equal passes. No tolerance.
 */
export function findRegressions(baseline: MetricsReport, current: MetricsReport): Regression[] {
  const regressions: Regression[] = [
    ...compareSlice("overall", baseline.overall, current.overall),
  ];
  for (const lang of ["RU", "EN"] as InterfaceLang[]) {
    // Spec: RU slice must not worsen; EN tracked for completeness under same rule.
    regressions.push(...compareSlice(`byLang.${lang}`, baseline.byLang[lang], current.byLang[lang]));
  }
  return regressions;
}

export function assertNotWorseThanBaseline(
  baseline: MetricsReport,
  current: MetricsReport,
): { ok: true } | { ok: false; regressions: Regression[] } {
  const regressions = findRegressions(baseline, current);
  if (regressions.length === 0) {
    return { ok: true };
  }
  return { ok: false, regressions };
}
