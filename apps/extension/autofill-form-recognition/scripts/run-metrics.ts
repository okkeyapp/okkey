#!/usr/bin/env node
/**
 * Build metrics report from committed annotations (hints path; no HTML required).
 * Usage:
 *   yarn --cwd apps/extension corpus:metrics
 *   yarn --cwd apps/extension corpus:metrics --write-baseline
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateAllAnnotations } from "../src/annotations.ts";
import { computeClassifierFingerprint } from "../src/classifier-fingerprint.ts";
import { buildMetricsReport, printReportSummary } from "../src/evaluate.ts";
import {
  BASELINE_REPORT,
  CLASSIFIER_FINGERPRINT_FILE,
  LATEST_REPORT,
  REPORTS_DIR,
  THRESHOLD_FILE,
} from "../src/paths.ts";
import { corpusIdFromSites, loadCorpusSites } from "../src/sites.ts";
import type { ThresholdDocument } from "../src/types.ts";

async function main(): Promise<void> {
  const writeBaseline = process.argv.includes("--write-baseline");
  const validation = validateAllAnnotations();
  if (!validation.ok) {
    console.error("Annotation validation failed:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  mkdirSync(REPORTS_DIR, { recursive: true });
  const report = buildMetricsReport();
  writeFileSync(LATEST_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const fingerprint = computeClassifierFingerprint();
  writeFileSync(
    CLASSIFIER_FINGERPRINT_FILE,
    `${JSON.stringify(fingerprint, null, 2)}\n`,
    "utf8",
  );

  console.log(printReportSummary(report));
  console.log(`wrote ${path.relative(process.cwd(), LATEST_REPORT)}`);

  if (writeBaseline) {
    writeFileSync(BASELINE_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const sites = loadCorpusSites();
    const threshold: ThresholdDocument = {
      schemaVersion: 1,
      corpusId: corpusIdFromSites(sites),
      corpusSiteCount: sites.length,
      baselineReportPath: "reports/baseline.json",
      policy: "not-worse-than-baseline",
    };
    writeFileSync(THRESHOLD_FILE, `${JSON.stringify(threshold, null, 2)}\n`, "utf8");
    console.log(`wrote baseline + threshold (${threshold.corpusId})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
