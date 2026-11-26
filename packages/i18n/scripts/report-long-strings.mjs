/**
 * List translated strings that are >40% longer than English (QA layout risk).
 * Focuses on keys that look like fixed-width UI (nav, buttons, tabs, short labels).
 *
 * Usage: node scripts/report-long-strings.mjs [--json] [--locale=de]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDir = path.join(pkgRoot, "src", "locales", "web");

/** Keys that typically render in constrained chrome (sidebar, tabs, menus, buttons). */
const FIXED_WIDTH_KEY_RE =
  /^(web\.nav\.|web\.shell\.|web\.accountMenu\.|web\.tips\.(prev|next|title|dismiss)$|web\.productTour\.|web\.settingsPopup\.[^.]+(\.[^.]+)?\.(title|tab|label|action|submit|cancel|save|close|add|remove|edit|delete|confirm|back)$|auth\.[^.]+\.(submit|title|tab|label|action|button)|web\.items\.menu\.|web\.keyForm\.types\.)/;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listCodes(filter) {
  return fs
    .readdirSync(webDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.basename(f, ".json"))
    .filter((c) => c !== "en" && c !== "ru")
    .filter((c) => !filter || c === filter)
    .sort((a, b) => a.localeCompare(b));
}

function main() {
  const asJson = process.argv.includes("--json");
  const localeArg = process.argv.find((a) => a.startsWith("--locale="));
  const filter = localeArg ? localeArg.slice("--locale=".length) : null;
  const en = loadJson(path.join(webDir, "en.json"));
  const findings = [];

  for (const code of listCodes(filter)) {
    const bundle = loadJson(path.join(webDir, `${code}.json`));
    for (const [key, enValue] of Object.entries(en)) {
      if (typeof enValue !== "string" || enValue.length === 0) continue;
      // Prefer constrained keys; also flag any short English label (≤22 chars) that grew a lot.
      const constrained = FIXED_WIDTH_KEY_RE.test(key) || enValue.length <= 22;
      if (!constrained) continue;
      const loc = bundle[key];
      if (typeof loc !== "string") continue;
      const growth = (loc.length - enValue.length) / enValue.length;
      if (growth > 0.4) {
        findings.push({
          locale: code,
          key,
          enLength: enValue.length,
          localeLength: loc.length,
          growthPercent: Math.round(growth * 100),
          constrainedKey: FIXED_WIDTH_KEY_RE.test(key),
          en: enValue,
          translated: loc,
        });
      }
    }
  }

  // Prefer constrained keys, then growth
  findings.sort(
    (a, b) =>
      Number(b.constrainedKey) - Number(a.constrainedKey) ||
      b.growthPercent - a.growthPercent ||
      a.locale.localeCompare(b.locale),
  );

  if (asJson) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
    return;
  }

  const constrained = findings.filter((f) => f.constrainedKey);
  console.log(
    `Strings >40% longer than English (new locales only). Constrained keys: ${constrained.length}; short-label extras: ${findings.length - constrained.length}\n`,
  );
  for (const row of constrained.slice(0, 120)) {
    console.log(
      `[${row.locale}] +${row.growthPercent}% ${row.key}\n  EN: ${row.en}\n  TR: ${row.translated}\n`,
    );
  }
  if (constrained.length > 120) {
    console.log(`… ${constrained.length - 120} more constrained-key findings`);
  }
}

main();
