/**
 * Coverage + ICU/placeholder integrity check for web and email locale JSON.
 * Fails when any non-fallback locale has broken placeholders/ICU vs English,
 * or when the generator readiness gate would disagree with measured coverage.
 *
 * Usage:
 *   node scripts/check-locale-coverage.mjs [--json] [--fail-under=80]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(pkgRoot, "package.json"));
// Resolve from package (or hoisted workspace) so the CLI works before `yarn install` in cwd quirks.
const { IntlMessageFormat } = require("intl-messageformat");

const localesRoot = path.join(pkgRoot, "src", "locales");
const webDir = path.join(localesRoot, "web");
const emailDir = path.join(localesRoot, "email");
const manifestPath = path.join(localesRoot, "manifest.json");

const DEFAULT_THRESHOLD = 80;
const DEFAULT_FALLBACK = "en";

/** Probe values that exercise common ICU branches without requiring real data. */
const ICU_PROBE_VALUES = {
  count: 2,
  days: 2,
  minutes: 2,
  hours: 2,
  seconds: 2,
  year: 2026,
  min: 8,
  max: 64,
  code: "123456",
  date: "2026-01-01",
  when: "2026-01-01",
  ip: "127.0.0.1",
  location: "Unknown",
  deviceName: "Device",
  zone: "zone",
  lang: "English",
  name: "Name",
  email: "user@example.com",
  url: "https://example.com",
  plan: "Premium",
  workspace: "Workspace",
  vault: "Vault",
  item: "Item",
  title: "Title",
  label: "Label",
  value: 1,
  n: 1,
  amount: 1,
  size: 1,
  remaining: 1,
};

function listLocaleCodes(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort((a, b) => a.localeCompare(b));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function keyCoveragePercent(localeBundle, referenceBundle) {
  const refKeys = Object.keys(referenceBundle);
  if (refKeys.length === 0) return 100;
  let present = 0;
  for (const key of refKeys) {
    if (Object.prototype.hasOwnProperty.call(localeBundle, key)) present += 1;
  }
  return Math.floor((present / refKeys.length) * 100);
}

/** Collect simple `{name}` placeholders outside of ICU argument syntax depth. */
function extractSimplePlaceholders(pattern) {
  const names = new Set();
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?:,|\})/g;
  let m;
  while ((m = re.exec(pattern)) !== null) {
    names.add(m[1]);
  }
  return [...names].sort();
}

function placeholdersMatch(enPattern, localePattern) {
  const a = extractSimplePlaceholders(enPattern);
  const b = extractSimplePlaceholders(localePattern);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function tryFormat(pattern, intlTag) {
  try {
    const values = {};
    for (const name of extractSimplePlaceholders(pattern)) {
      values[name] = Object.prototype.hasOwnProperty.call(ICU_PROBE_VALUES, name)
        ? ICU_PROBE_VALUES[name]
        : "x";
    }
    new IntlMessageFormat(pattern, intlTag).format(values);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function checkBundlePair({
  surface,
  locale,
  intlTag,
  reference,
  bundle,
}) {
  const errors = [];
  const missingKeys = [];
  for (const [key, enPattern] of Object.entries(reference)) {
    if (!Object.prototype.hasOwnProperty.call(bundle, key)) {
      missingKeys.push(key);
      continue;
    }
    const locPattern = bundle[key];
    if (typeof locPattern !== "string") {
      errors.push({ key, reason: "value is not a string" });
      continue;
    }
    if (!placeholdersMatch(enPattern, locPattern)) {
      errors.push({
        key,
        reason: "placeholder/ICU argument mismatch vs English",
        en: extractSimplePlaceholders(enPattern),
        locale: extractSimplePlaceholders(locPattern),
      });
      continue;
    }
    const enErr = tryFormat(enPattern, "en-US");
    if (enErr) {
      // Reference bundle itself is broken — report once as English issue.
      errors.push({ key, reason: `English ICU parse failed: ${enErr}` });
      continue;
    }
    const locErr = tryFormat(locPattern, intlTag);
    if (locErr) {
      errors.push({ key, reason: `ICU parse/format failed: ${locErr}` });
    }
  }
  const coveragePercent = keyCoveragePercent(bundle, reference);
  return {
    surface,
    locale,
    coveragePercent,
    totalKeys: Object.keys(reference).length,
    translatedKeys: Object.keys(reference).length - missingKeys.length,
    missingKeys,
    errors,
  };
}

function resolveIntl(code, manifestLocales) {
  const raw = manifestLocales?.[code];
  if (raw && typeof raw.intl === "string") return raw.intl;
  if (code === "en") return "en-US";
  if (code === "ru") return "ru-RU";
  if (code === "pt-BR") return "pt-BR";
  return code;
}

export function runCoverageCheck({
  threshold = DEFAULT_THRESHOLD,
  failOnPlaceholderErrors = true,
} = {}) {
  const webCodes = listLocaleCodes(webDir);
  const emailCodes = listLocaleCodes(emailDir);
  const webSet = new Set(webCodes);
  const emailSet = new Set(emailCodes);
  const onlyWeb = webCodes.filter((c) => !emailSet.has(c));
  const onlyEmail = emailCodes.filter((c) => !webSet.has(c));
  if (onlyWeb.length > 0 || onlyEmail.length > 0) {
    throw new Error(
      `Web and email locale sets must match. onlyWeb=${onlyWeb.join(",") || "∅"} onlyEmail=${onlyEmail.join(",") || "∅"}`,
    );
  }

  const manifest = fs.existsSync(manifestPath) ? loadJson(manifestPath) : {};
  const readinessThreshold =
    typeof manifest.readinessThresholdPercent === "number"
      ? manifest.readinessThresholdPercent
      : threshold;
  const fallback = manifest.defaults?.fallback ?? DEFAULT_FALLBACK;
  const manifestLocales =
    manifest.locales && typeof manifest.locales === "object" ? manifest.locales : {};

  if (!webCodes.includes(fallback)) {
    throw new Error(`Fallback locale "${fallback}" is missing`);
  }

  const webEn = loadJson(path.join(webDir, `${fallback}.json`));
  const emailEn = loadJson(path.join(emailDir, `${fallback}.json`));

  const reports = [];
  const readyLocales = [];

  for (const code of webCodes) {
    const webBundle = loadJson(path.join(webDir, `${code}.json`));
    const emailBundle = loadJson(path.join(emailDir, `${code}.json`));
    const intlTag = resolveIntl(code, manifestLocales);
    const webReport = checkBundlePair({
      surface: "web",
      locale: code,
      intlTag,
      reference: webEn,
      bundle: webBundle,
    });
    const emailReport = checkBundlePair({
      surface: "email",
      locale: code,
      intlTag,
      reference: emailEn,
      bundle: emailBundle,
    });
    reports.push(webReport, emailReport);

    const readyFlag = manifestLocales[code]?.ready !== false;
    const coverageOk =
      webReport.coveragePercent >= readinessThreshold &&
      emailReport.coveragePercent >= readinessThreshold;
    const noBlockingErrors =
      !failOnPlaceholderErrors ||
      (webReport.errors.length === 0 && emailReport.errors.length === 0);
    if (readyFlag && coverageOk && noBlockingErrors) {
      readyLocales.push(code);
    }
  }

  const placeholderFailures = reports.filter((r) => r.errors.length > 0);
  const ok = placeholderFailures.length === 0 && readyLocales.includes(fallback);

  return {
    ok,
    threshold: readinessThreshold,
    fallback,
    locales: webCodes,
    readyLocales,
    reports,
    summary: Object.fromEntries(
      webCodes.map((code) => {
        const web = reports.find((r) => r.locale === code && r.surface === "web");
        const email = reports.find((r) => r.locale === code && r.surface === "email");
        return [
          code,
          {
            webCoveragePercent: web?.coveragePercent ?? 0,
            emailCoveragePercent: email?.coveragePercent ?? 0,
            webErrors: web?.errors.length ?? 0,
            emailErrors: email?.errors.length ?? 0,
            ready: readyLocales.includes(code),
          },
        ];
      }),
    ),
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const failUnderArg = args.find((a) => a.startsWith("--fail-under="));
  const threshold = failUnderArg
    ? Number(failUnderArg.split("=")[1])
    : DEFAULT_THRESHOLD;

  const result = runCoverageCheck({ threshold });
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`Locale coverage check (threshold ${result.threshold}%)`);
    console.log(`Ready locales (≥ threshold, no ICU errors): ${result.readyLocales.join(", ")}`);
    for (const [code, row] of Object.entries(result.summary)) {
      console.log(
        `  ${code}: web=${row.webCoveragePercent}% email=${row.emailCoveragePercent}% errors=${row.webErrors + row.emailErrors} ready=${row.ready}`,
      );
    }
    const failures = result.reports.filter((r) => r.errors.length > 0);
    if (failures.length > 0) {
      console.error("\nPlaceholder / ICU mismatches:");
      for (const report of failures) {
        for (const err of report.errors.slice(0, 20)) {
          console.error(`  [${report.surface}/${report.locale}] ${err.key}: ${err.reason}`);
        }
        if (report.errors.length > 20) {
          console.error(`  … ${report.errors.length - 20} more for ${report.surface}/${report.locale}`);
        }
      }
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
