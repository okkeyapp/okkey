#!/usr/bin/env node
/**
 * Turn .github/security/cve-exceptions.yaml into a Trivy .trivyignore.
 *
 * Every record must include id, image, package, reason, expiry, and
 * accepted_by. A missing field, a wildcard / severity-wide id, or an
 * expiry before today fails the process (the publish job goes red).
 * Only valid unexpired records are written, and only for the image
 * being scanned. Trivy ignore files match CVE ids, so `package` is the
 * reviewed package name and does not narrow the ignore.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SCANNED_IMAGES = ["api", "worker", "web"];
const REQUIRED_FIELDS = [
  "id",
  "image",
  "package",
  "reason",
  "expiry",
  "accepted_by",
];
const SEVERITY_WORDS = new Set([
  "*",
  "all",
  "any",
  "critical",
  "high",
  "medium",
  "low",
  "unknown",
]);
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;
const PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9.+_@/-]{0,127}$/;
const ACCEPTED_BY = /^[A-Za-z0-9][A-Za-z0-9._@+-]{1,80}$/;

export class CveExceptionError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "CveExceptionError";
  }
}

/**
 * @param {Date} [now]
 * @returns {string}
 */
export function utcToday(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isWildcard(value) {
  const normalized = value.trim().toLowerCase();
  return (
    SEVERITY_WORDS.has(normalized) ||
    normalized.includes("*") ||
    normalized.includes("?")
  );
}

/**
 * @param {string} raw
 * @param {number} lineNo
 * @returns {string}
 */
function parseScalar(raw, lineNo) {
  if (raw === "" || raw === "null" || raw === "~" || raw === '""' || raw === "''") {
    return "";
  }
  if (raw.startsWith("|") || raw.startsWith(">") || raw.startsWith("{") || raw.startsWith("[")) {
    throw new CveExceptionError(
      `unsupported value on line ${lineNo}; keep each field on one line`,
    );
  }
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2) {
      throw new CveExceptionError(`unterminated string on line ${lineNo}`);
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "string") {
        throw new CveExceptionError(`expected a string on line ${lineNo}`);
      }
      return parsed;
    } catch (err) {
      if (err instanceof CveExceptionError) throw err;
      throw new CveExceptionError(`invalid string on line ${lineNo}`);
    }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) {
      throw new CveExceptionError(`unterminated string on line ${lineNo}`);
    }
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

/**
 * @param {Record<string, string>} record
 * @param {string} body
 * @param {number} lineNo
 */
function assignField(record, body, lineNo) {
  const colon = body.indexOf(":");
  if (colon <= 0) {
    throw new CveExceptionError(`expected key: value on line ${lineNo}`);
  }
  const key = body.slice(0, colon).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new CveExceptionError(`invalid field name on line ${lineNo}`);
  }
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    throw new CveExceptionError(`duplicate field ${key} on line ${lineNo}`);
  }
  record[key] = parseScalar(body.slice(colon + 1).trim(), lineNo);
}

/**
 * @param {Record<string, string>} record
 * @param {number} index
 * @param {string} today
 * @returns {Record<string, string>}
 */
function validateRecord(record, index, today) {
  const where = `exception ${index + 1}`;
  for (const key of Object.keys(record)) {
    if (!REQUIRED_FIELDS.includes(key)) {
      throw new CveExceptionError(`unknown field ${key} on ${where}`);
    }
  }
  for (const key of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new CveExceptionError(`missing field ${key} on ${where}`);
    }
    if (record[key].trim() === "") {
      throw new CveExceptionError(`missing field ${key} on ${where}`);
    }
  }
  for (const key of ["id", "image", "package"]) {
    if (isWildcard(record[key])) {
      throw new CveExceptionError(
        `wildcard or severity-wide ignore is not allowed (${key} on ${where})`,
      );
    }
  }
  if (!CVE_ID.test(record.id)) {
    throw new CveExceptionError(`invalid CVE id on ${where}`);
  }
  if (!SCANNED_IMAGES.includes(record.image)) {
    throw new CveExceptionError(
      `invalid image on ${where} (expected api, worker, or web)`,
    );
  }
  if (!PACKAGE_NAME.test(record.package)) {
    throw new CveExceptionError(`invalid package on ${where}`);
  }
  if (!isValidIsoDate(record.expiry)) {
    throw new CveExceptionError(`invalid expiry date on ${where}`);
  }
  if (record.expiry < today) {
    throw new CveExceptionError(
      `exception ${record.id} for ${record.image} expired on ${record.expiry} (today ${today})`,
    );
  }
  if (record.reason.trim().length < 12) {
    throw new CveExceptionError(`reason is too short on ${where}`);
  }
  if (/[\u0000-\u001F]/.test(record.reason)) {
    throw new CveExceptionError(`reason must be a single line on ${where}`);
  }
  if (!ACCEPTED_BY.test(record.accepted_by)) {
    throw new CveExceptionError(`invalid accepted_by on ${where}`);
  }
  return record;
}

/**
 * @param {string} text
 * @param {{ today?: string }} [options]
 * @returns {Array<{ id: string, image: string, package: string, reason: string, expiry: string, accepted_by: string }>}
 */
export function parseCveExceptions(text, options = {}) {
  const today = options.today ?? utcToday();
  if (!isValidIsoDate(today)) {
    throw new CveExceptionError(`invalid today date: ${today}`);
  }

  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  let sawKey = false;
  let emptyList = false;
  /** @type {Record<string, string>[]} */
  const records = [];
  /** @type {Record<string, string> | null} */
  let current = null;
  let index = 0;

  const finish = () => {
    if (!current) return;
    records.push(validateRecord(current, index, today));
    index += 1;
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].replace(/\s+$/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (line.includes("\t")) {
      throw new CveExceptionError(`tabs are not allowed on line ${lineNo}`);
    }
    if (!sawKey) {
      if (trimmed === "exceptions: []") {
        sawKey = true;
        emptyList = true;
        continue;
      }
      if (trimmed === "exceptions:") {
        sawKey = true;
        continue;
      }
      throw new CveExceptionError("missing exceptions key");
    }
    if (emptyList) {
      throw new CveExceptionError(
        `unexpected content after an empty exceptions list on line ${lineNo}`,
      );
    }
    if (trimmed.startsWith("- ")) {
      finish();
      current = {};
      assignField(current, trimmed.slice(2).trim(), lineNo);
      continue;
    }
    if (current && /^[A-Za-z0-9_-]+:/.test(trimmed)) {
      assignField(current, trimmed, lineNo);
      continue;
    }
    throw new CveExceptionError(`invalid syntax on line ${lineNo}`);
  }
  finish();
  if (!sawKey) {
    throw new CveExceptionError("missing exceptions key");
  }

  const seen = new Set();
  for (const record of records) {
    const key = `${record.image}\0${record.id}`;
    if (seen.has(key)) {
      throw new CveExceptionError(
        `duplicate CVE ${record.id} for image ${record.image}`,
      );
    }
    seen.add(key);
  }
  return records;
}

/**
 * @param {Array<{ id: string, image: string }>} records
 * @param {string} image
 * @returns {string}
 */
export function renderTrivyIgnore(records, image) {
  if (!SCANNED_IMAGES.includes(image)) {
    throw new CveExceptionError(`invalid image: ${image}`);
  }
  const ids = [];
  for (const record of records) {
    if (record.image === image && !ids.includes(record.id)) {
      ids.push(record.id);
    }
  }
  return [
    "# Generated by scripts/render-trivy-ignore.mjs",
    `# image: ${image}`,
    "# Valid unexpired CVE exceptions only. Do not edit.",
    ...ids,
    "",
  ].join("\n");
}

/**
 * @param {string[]} argv
 * @returns {{ exceptions: string, image: string, out: string, today: string }}
 */
function parseArgs(argv) {
  /** @type {{ exceptions: string, image: string, out: string, today: string }} */
  const args = { exceptions: "", image: "", out: "", today: "" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (
      flag !== "--exceptions" &&
      flag !== "--image" &&
      flag !== "--out" &&
      flag !== "--today"
    ) {
      throw new CveExceptionError(`unknown argument ${flag}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new CveExceptionError(`missing value for ${flag}`);
    }
    i += 1;
    if (flag === "--exceptions") args.exceptions = value;
    if (flag === "--image") args.image = value;
    if (flag === "--out") args.out = value;
    if (flag === "--today") args.today = value;
  }
  if (!args.exceptions) {
    throw new CveExceptionError("missing --exceptions");
  }
  if (!args.image) {
    throw new CveExceptionError("missing --image");
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(args.exceptions, "utf8");
  const records = parseCveExceptions(
    text,
    args.today ? { today: args.today } : {},
  );
  const ignore = renderTrivyIgnore(records, args.image);
  if (args.out) {
    writeFileSync(args.out, ignore, "utf8");
  } else {
    process.stdout.write(ignore);
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
