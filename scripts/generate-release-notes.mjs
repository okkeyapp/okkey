#!/usr/bin/env node
/**
 * Draft bilingual release notes + CHANGELOG.md from Conventional Commits.
 *
 * Usage:
 *   node scripts/generate-release-notes.mjs --from v1.0.0-beta.1 --to HEAD --version 1.0.0-beta.2
 *
 * Writes:
 *   - docs/releases/vX.Y.Z[-pre].md  (draft; human edits outside AUTO block preserved on re-run)
 *   - CHANGELOG.md                   (prepends / updates AUTO block for this version)
 *
 * Does not create a GitHub Release and does not tag.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {
    from: null,
    to: "HEAD",
    version: null,
    extensionOutOfScope: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--from") out.from = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--version") out.version = argv[++i];
    else if (a === "--extension-in-scope") out.extensionOutOfScope = false;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/generate-release-notes.mjs --from <git-ref> --version <semver> [--to HEAD]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!out.from || !out.version) {
    throw new Error("--from and --version are required");
  }
  return out;
}

function gitLog(from, to) {
  const range = `${from}..${to}`;
  const raw = execFileSync("git", ["log", "--pretty=format:%s", range], {
    cwd: root,
    encoding: "utf8",
  });
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function classify(subjects) {
  const feat = [];
  const fix = [];
  const other = [];
  for (const s of subjects) {
    if (/^(feat)(\(.+\))?!?:/i.test(s)) feat.push(s);
    else if (/^(fix)(\(.+\))?!?:/i.test(s)) fix.push(s);
    else other.push(s);
  }
  return { feat, fix, other };
}

function bullets(lines, emptyLabel) {
  if (lines.length === 0) return `- ${emptyLabel}`;
  return lines.map((l) => `- ${l}`).join("\n");
}

function isPreRelease(version) {
  return /-(beta|rc|alpha)\./i.test(version) || /-(beta|rc|alpha)$/i.test(version);
}

function fillTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function upsertAutoBlock(existing, markerBegin, markerEnd, body) {
  const begin = `<!-- ${markerBegin} -->`;
  const end = `<!-- ${markerEnd} -->`;
  const block = `${begin}\n${body.trim()}\n${end}`;
  if (!existing) return `${block}\n`;
  const start = existing.indexOf(begin);
  const stop = existing.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) {
    return `${block}\n\n${existing}`;
  }
  const before = existing.slice(0, start);
  const after = existing.slice(stop + end.length);
  return `${before}${block}${after}`;
}

function main() {
  const args = parseArgs(process.argv);
  const subjects = gitLog(args.from, args.to);
  const { feat, fix, other } = classify(subjects);
  const imageTag = args.version.replace(/^v/, "");
  const versionDisplay = args.version.startsWith("v")
    ? args.version
    : `v${args.version}`;
  const pre = isPreRelease(imageTag) ? "yes" : "no";

  const extEn = args.extensionOutOfScope
    ? "Not in this slice (browser extension ships in a separate cycle)."
    : "_Fill in store / version details._";
  const extRu = args.extensionOutOfScope
    ? "Не в этом срезе (расширение — отдельный цикл)."
    : "_Заполнить магазины / версию._";

  const tplPath = join(root, "docs/release-notes.template.md");
  const tpl = readFileSync(tplPath, "utf8");

  const noneEn = "_None in this range._";
  const noneRu = "_Нет в этом диапазоне._";
  const vars = {
    VERSION: versionDisplay,
    PRE_RELEASE: pre,
    IMAGE_TAG: imageTag,
    EN_FEAT: bullets(feat, noneEn),
    EN_FIX: bullets(fix, noneEn),
    EN_OTHER: bullets(other, noneEn),
    RU_FEAT: bullets(feat, noneRu),
    RU_FIX: bullets(fix, noneRu),
    RU_OTHER: bullets(other, noneRu),
    MIGRATION_ROWS: "_TBD_",
    API_VERSION: "_TBD_",
    DATA_FORMAT_VERSION: "_TBD_",
    CLIENTS: "web (Core); extension out of scope for beta.2",
    EN_EXTENSION: extEn,
    RU_EXTENSION: extRu,
    EN_SECURITY: "_Public summary only — no private issue details._",
    RU_SECURITY: "_Только публичное резюме — без деталей приватных issues._",
    EN_WAIVERS: "_List waived non-blocking issues here._",
    RU_WAIVERS: "_Список waiver (не жёсткие блокеры)._",
  };

  const rendered = fillTemplate(tpl, vars);
  const releasesDir = join(root, "docs/releases");
  mkdirSync(releasesDir, { recursive: true });
  const draftPath = join(releasesDir, `${versionDisplay}.md`);
  const autoBegin = `AUTO:BEGIN:${versionDisplay}`;
  const autoEnd = `AUTO:END:${versionDisplay}`;
  const existingDraft = existsSync(draftPath)
    ? readFileSync(draftPath, "utf8")
    : "";
  const draftBody = upsertAutoBlock(
    existingDraft,
    autoBegin,
    autoEnd,
    rendered,
  );
  writeFileSync(draftPath, draftBody, "utf8");

  const changelogPath = join(root, "CHANGELOG.md");
  const existingCl = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf8")
    : `# Changelog

All notable changes are generated from the same source as GitHub Release notes
(\`scripts/generate-release-notes.mjs\` + \`docs/release-notes.template.md\`).
Do not edit AUTO blocks by hand; edit outside markers or re-run after human review.

`;
  const clSection = `## ${versionDisplay}\n\n${rendered}\n`;
  const nextCl = upsertAutoBlock(
    existingCl,
    `AUTO:BEGIN:${versionDisplay}`,
    `AUTO:END:${versionDisplay}`,
    clSection,
  );
  writeFileSync(changelogPath, nextCl, "utf8");

  console.log(`Wrote ${draftPath}`);
  console.log(`Updated ${changelogPath}`);
  console.log(
    `Commits classified: feat=${feat.length} fix=${fix.length} other=${other.length}`,
  );
}

main();
