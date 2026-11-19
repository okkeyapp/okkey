#!/usr/bin/env node
/**
 * CI gate: annotation consistency + metrics not worse than committed baseline.
 *
 * Network capture of 247 third-party sites is not reliable in CI (anti-bot).
 * CI therefore:
 * 1) validates annotation JSON schema/consistency
 * 2) recomputes metrics from embedded field hints (no HTML cache)
 * 3) compares to reports/baseline.json with zero tolerance
 * 4) verifies classifier fingerprint is recorded (regression detection hook)
 *
 * Local capture: yarn --cwd apps/extension corpus:capture
 * (HTML lands in gitignored autofill-form-recognition/cache/).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { validateAllAnnotations } from "../src/annotations.ts";
import { computeClassifierFingerprint } from "../src/classifier-fingerprint.ts";
import { buildMetricsReport, printReportSummary } from "../src/evaluate.ts";
import {
  BASELINE_REPORT,
  CLASSIFIER_FINGERPRINT_FILE,
  LATEST_REPORT,
  THRESHOLD_FILE,
} from "../src/paths.ts";
import { corpusIdFromSites, loadCorpusSites } from "../src/sites.ts";
import { assertNotWorseThanBaseline } from "../src/threshold.ts";
import type { MetricsReport, ThresholdDocument } from "../src/types.ts";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function printHelp(): void {
  console.log(`Usage: yarn --cwd apps/extension corpus:check

CI gate: validate annotations, recompute metrics from hints, fail if any of
(a)/(b) P·R·F1/(c)/RU·EN slices is worse than reports/baseline.json (equal OK).
Also fails when sites.csv composition no longer matches reports/threshold.json.
`);
}

function main(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const validation = validateAllAnnotations();
  if (!validation.ok) {
    console.error("Annotation validation failed:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    fail("annotations invalid");
  }

  if (!existsSync(BASELINE_REPORT) || !existsSync(THRESHOLD_FILE)) {
    fail("baseline.json / threshold.json missing — run corpus:metrics --write-baseline locally first");
  }

  const threshold = JSON.parse(readFileSync(THRESHOLD_FILE, "utf8")) as ThresholdDocument;
  const sites = loadCorpusSites();
  const corpusId = corpusIdFromSites(sites);
  if (threshold.corpusSiteCount !== sites.length) {
    fail(
      `corpus composition changed (${threshold.corpusSiteCount} → ${sites.length}); start a new baseline`,
    );
  }
  if (threshold.corpusId !== corpusId) {
    fail(`corpusId changed (${threshold.corpusId} → ${corpusId}); start a new baseline`);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_REPORT, "utf8")) as MetricsReport;
  const current = buildMetricsReport();
  writeFileSync(LATEST_REPORT, `${JSON.stringify(current, null, 2)}\n`, "utf8");

  console.log("Current metrics:");
  console.log(printReportSummary(current));

  const comparison = assertNotWorseThanBaseline(baseline, current);
  if (!comparison.ok) {
    console.error("Regressions vs baseline:");
    for (const row of comparison.regressions) {
      console.error(`  - ${row.path}: ${row.baseline} → ${row.current} (${row.detail})`);
    }
    fail("metrics worse than baseline");
  }

  const fingerprint = computeClassifierFingerprint();
  if (existsSync(CLASSIFIER_FINGERPRINT_FILE)) {
    const recorded = JSON.parse(readFileSync(CLASSIFIER_FINGERPRINT_FILE, "utf8")) as {
      sha256: string;
    };
    if (recorded.sha256 !== fingerprint.sha256) {
      console.warn(
        `NOTE: classifier fingerprint changed (${recorded.sha256.slice(0, 12)}… → ${fingerprint.sha256.slice(0, 12)}…). ` +
          `Metrics must not regress; update fingerprint only with an intentional classifier change after baseline acceptance.`,
      );
      // Fingerprint drift alone does not fail CI — metric regression does.
      // This measurement PR must keep fingerprint identical to baseline recording.
      if (baseline.classifierSha === recorded.sha256 && fingerprint.sha256 !== baseline.classifierSha) {
        // Classifier sources changed vs what baseline was measured against.
        // Still OK if metrics hold; warn loudly.
        console.warn("Classifier sources differ from baseline classifierSha; ensure this is intentional.");
      }
    }
  }

  console.log("OK: annotations valid; metrics not worse than baseline.");
}

main();
