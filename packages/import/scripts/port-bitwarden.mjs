#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src/importers/bitwarden-ported");
const BASE = "https://raw.githubusercontent.com/bitwarden/clients/main";

const SKIP_PATTERNS = [
  /\.spec\.ts$/,
  /keeper\/access\//,
  /fsk-test-data\.ts$/,
  /\/sdk\//,
  /\/metadata\//,
  /\/services\//,
  /\/models\//,
];

const IMPORT_REPLACEMENTS = [
  ['from "@bitwarden/common/admin-console/models/collections"', 'from "../../types/views/folder.view.js"'],
  ['from "@bitwarden/common/autofill/utils"', 'from "../../utils/utils.js"'],
  ['from "@bitwarden/common/platform/misc/utils"', 'from "../../utils/utils.js"'],
  ['from "@bitwarden/common/vault/enums"', 'from "../../types/enums.js"'],
  ['from "@bitwarden/common/vault/models/view/cipher.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/card.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/field.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/folder.view"', 'from "../../types/views/folder.view.js"'],
  ['from "@bitwarden/common/vault/models/view/identity.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/login-uri.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/login.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/secure-note.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/vault/models/view/attachment.view"', 'from "../../types/views/cipher.view.js"'],
  ['from "@bitwarden/common/models/export"', 'from "../../types/bitwarden-export.js"'],
  ['from "@bitwarden/vault-export-core"', 'from "../../types/bitwarden-export.js"'],
  ['from "../models/import-result"', 'from "../../types/import-result.js"'],
  ['from "../../models/import-result"', 'from "../../types/import-result.js"'],
  ['from "../../../models/import-result"', 'from "../../../types/import-result.js"'],
  ['from "../base-importer"', 'from "../../base-importer.js"'],
  ['from "../../base-importer"', 'from "../../../base-importer.js"'],
  ['from "../importer"', 'from "../../importer.js"'],
  ['from "../../importer"', 'from "../../../importer.js"'],
  ['from "./importer"', 'from "../../importer.js"'],
  ['from "./base-importer"', 'from "../../base-importer.js"'],
  ['OrganizationId', 'string | null'],
  ['CollectionId', 'string'],
];

function transformSource(source, relDepth) {
  let out = source;
  out = out.replace(/^\/\/ FIXME.*\n\/\/ @ts-strict-ignore\n/gm, "");
  out = out.replace(/import \{ LogService \}[^\n]+\n/g, "");
  out = out.replace(/import \{ ConsoleLogService \}[^\n]+\n/g, "");
  out = out.replace(/protected logService[^\n]+\n/g, "");
  out = out.replace(/this\.logService\.warning\([^)]+\);\n/g, "");
  for (const [from, to] of IMPORT_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  // Fix relative base-importer paths based on depth
  const up = relDepth > 0 ? "../".repeat(relDepth) : "./";
  out = out.replace(/from "\.\.\/\.\.\/base-importer\.js"/g, `from "${up}base-importer.js"`.replace("./../", "../"));
  return out;
}

async function main() {
  const treeRes = await fetch("https://api.github.com/repos/bitwarden/clients/git/trees/main?recursive=1");
  const tree = await treeRes.json();
  const files = tree.tree
    .map((t) => t.path)
    .filter((p) => p.startsWith("libs/importer/src/importers/") && p.endsWith(".ts"))
    .filter((p) => !SKIP_PATTERNS.some((re) => re.test(p)))
    .filter((p) => p !== "libs/importer/src/importers/base-importer.ts")
    .filter((p) => p !== "libs/importer/src/importers/importer.ts")
    .filter((p) => p !== "libs/importer/src/importers/index.ts");

  fs.mkdirSync(OUT, { recursive: true });

  for (const filePath of files) {
    const rel = filePath.replace("libs/importer/src/importers/", "");
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const url = `${BASE}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("skip", filePath, res.status);
      continue;
    }
    const depth = rel.split("/").length - 1;
    const transformed = transformSource(await res.text(), depth);
    fs.writeFileSync(dest, transformed);
    console.log("ported", rel);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
