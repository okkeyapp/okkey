/**
 * Style guards for locale JSON (link glue spacing, keyForm field-label casing).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDir = path.join(pkgRoot, "src", "locales", "web");

/** Locales that capitalize common nouns (German). Skipped for lowercase field-label rule. */
const TITLECASE_NOUN_LOCALES = new Set(["de"]);

/**
 * Field labels may start with these mixed-case brands or explicit abbreviations.
 * All-uppercase ASCII acronyms (2+ letters, e.g. URL, VIN, IBAN, SWIFT, CVC)
 * are also allowed via `isAllowedFieldLabelStart`.
 * Matched as a whole first word (split on space, `/`, `-`).
 */
const FIELD_LABEL_ALLOWED_START_TOKENS = new Set([
  "URL",
  "SID",
  "CVC",
  "CVV",
  "IBAN",
  "SWIFT",
  "TOTP",
  "PIN",
  "VIN",
  "ID",
  "IP",
  "AirPort",
  "Okkey",
  "SSH",
  "API",
  "HTTP",
  "HTTPS",
  "UUID",
  "QR",
  "OTP",
  "SSO",
  "WPA",
  "WPA2",
  "WPA3",
]);

export function isAllowedFieldLabelStart(token) {
  if (FIELD_LABEL_ALLOWED_START_TOKENS.has(token)) return true;
  return /^[A-Z]{2,}[0-9]*$/u.test(token);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listWebLocales() {
  return fs
    .readdirSync(webDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .sort((a, b) => a.localeCompare(b));
}

function firstToken(label) {
  const trimmed = label.trim();
  if (!trimmed) return "";
  // "CVC/CVV" → CVC; "URL-adres" → URL; "AirPort ID" → AirPort
  return trimmed.split(/[\s/.-]/u)[0] ?? "";
}

function isLatinUpperStart(label) {
  const ch = label.trim()[0];
  if (!ch) return false;
  // Only enforce for Latin letters (skip Cyrillic etc. — those locales have their own rules).
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch)) return false;
  return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

/**
 * `*BeforeLink` must leave a glue gap before the linked text (trailing space,
 * or end with opening quote/bracket). `*AfterLink` that continues with a word
 * must start with a space (e.g. German " zu.").
 */
export function checkLinkGlueSpacing(locales = listWebLocales()) {
  const errors = [];
  for (const code of locales) {
    const bundle = loadJson(path.join(webDir, `${code}.json`));
    for (const [key, value] of Object.entries(bundle)) {
      if (typeof value !== "string") continue;
      if (/BeforeLink$/u.test(key)) {
        const ok = /\s$/u.test(value) || /[(\[{«„"']$/u.test(value);
        if (!ok) {
          errors.push({
            locale: code,
            key,
            reason: "BeforeLink must end with whitespace (or opening punctuation) so the linked text is spaced",
            value,
          });
        }
      }
      if (/AfterLink$/u.test(key)) {
        if (/^[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(value)) {
          errors.push({
            locale: code,
            key,
            reason: "AfterLink continues with a word but has no leading space",
            value,
          });
        }
      }
    }
  }
  return errors;
}

export function isFieldLabelCasingValid(value) {
  if (typeof value !== "string" || value.length === 0) return true;
  if (!isLatinUpperStart(value)) return true;
  return isAllowedFieldLabelStart(firstToken(value));
}

/**
 * Non-German keyForm field labels should be lowercase except allow-listed
 * abbreviations/brands at the start.
 */
export function checkKeyFormFieldLabelCasing(locales = listWebLocales()) {
  const errors = [];
  for (const code of locales) {
    if (TITLECASE_NOUN_LOCALES.has(code)) continue;
    const bundle = loadJson(path.join(webDir, `${code}.json`));
    for (const [key, value] of Object.entries(bundle)) {
      if (!key.startsWith("web.keyForm.fieldLabels.")) continue;
      if (isFieldLabelCasingValid(value)) continue;
      errors.push({
        locale: code,
        key,
        reason: "field label starts with uppercase; use lowercase except abbreviations/brands",
        value,
      });
    }
  }
  return errors;
}

export function runLocaleStyleCheck() {
  const locales = listWebLocales();
  const linkErrors = checkLinkGlueSpacing(locales);
  const labelErrors = checkKeyFormFieldLabelCasing(locales);
  return {
    ok: linkErrors.length === 0 && labelErrors.length === 0,
    linkErrors,
    labelErrors,
  };
}

function main() {
  const result = runLocaleStyleCheck();
  if (result.linkErrors.length > 0) {
    console.error("Link glue spacing issues:");
    for (const err of result.linkErrors) {
      console.error(`  [${err.locale}] ${err.key}: ${err.reason} — ${JSON.stringify(err.value)}`);
    }
  }
  if (result.labelErrors.length > 0) {
    console.error("keyForm fieldLabels casing issues:");
    for (const err of result.labelErrors) {
      console.error(`  [${err.locale}] ${err.key}: ${JSON.stringify(err.value)}`);
    }
  }
  if (!result.ok) {
    process.exit(1);
  }
  console.log("Locale style check OK");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
