import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of autofill-form-recognition package (parent of src/). */
export const PACKAGE_ROOT = path.resolve(here, "..");

export const SITES_CSV = path.join(PACKAGE_ROOT, "sites.csv");
export const ANNOTATIONS_DIR = path.join(PACKAGE_ROOT, "annotations", "pages");
export const REPORTS_DIR = path.join(PACKAGE_ROOT, "reports");
export const CACHE_DIR = path.join(PACKAGE_ROOT, "cache");
export const FIXTURES_DIR = path.join(PACKAGE_ROOT, "fixtures");
export const BASELINE_REPORT = path.join(REPORTS_DIR, "baseline.json");
export const LATEST_REPORT = path.join(REPORTS_DIR, "latest.json");
export const THRESHOLD_FILE = path.join(REPORTS_DIR, "threshold.json");
export const CAPTURE_STATUS_FILE = path.join(REPORTS_DIR, "capture-status.json");
export const CLASSIFIER_FINGERPRINT_FILE = path.join(
  REPORTS_DIR,
  "classifier-fingerprint.json",
);

/** Extension lib sources used by the baseline classifier (must stay unchanged in this PR). */
export const CLASSIFIER_SOURCE_FILES = [
  path.resolve(PACKAGE_ROOT, "../src/lib/autofillFieldClassify.ts"),
  path.resolve(PACKAGE_ROOT, "../src/lib/loginFormFields.ts"),
  path.resolve(PACKAGE_ROOT, "../src/lib/autofillFormDetect.ts"),
] as const;

export function pageCacheDir(pageId: string): string {
  return path.join(CACHE_DIR, pageId);
}

export function pageAnnotationDir(pageId: string): string {
  return path.join(ANNOTATIONS_DIR, pageId);
}

export function annotatorPath(pageId: string, annotator: "A" | "B"): string {
  return path.join(pageAnnotationDir(pageId), `annotator-${annotator.toLowerCase()}.json`);
}
