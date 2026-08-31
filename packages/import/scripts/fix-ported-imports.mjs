#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTED = path.join(__dirname, "../src/importers/bitwarden-ported");

function rel(fromDir, toFile) {
  let relPath = path.relative(fromDir, toFile).replace(/\\/g, "/");
  if (!relPath.startsWith(".")) {
    relPath = `./${relPath}`;
  }
  return relPath.replace(/\.ts$/, ".js");
}

function fixFile(filePath) {
  const dir = path.dirname(filePath);
  const toBase = rel(dir, path.join(__dirname, "../src/importers/base-importer.ts"));
  const toImporter = rel(dir, path.join(__dirname, "../src/importers/importer.ts"));
  const toImportResult = rel(dir, path.join(__dirname, "../src/types/import-result.ts"));
  const toEnums = rel(dir, path.join(__dirname, "../src/types/enums.ts"));
  const toCipherView = rel(dir, path.join(__dirname, "../src/types/views/cipher.view.ts"));
  const toFolderView = rel(dir, path.join(__dirname, "../src/types/views/folder.view.ts"));
  const toBitwardenExport = rel(dir, path.join(__dirname, "../src/types/bitwarden-export.ts"));

  let source = fs.readFileSync(filePath, "utf8");
  source = source.replace(/from "\.\.?\/[^"]*base-importer\.js"/g, `from "${toBase}"`);
  source = source.replace(/from "\.\.?\/[^"]*importer\.js"/g, `from "${toImporter}"`);
  source = source.replace(/from "\.\.?\/[^"]*import-result\.js"/g, `from "${toImportResult}"`);
  source = source.replace(/from "\.\.?\/[^"]*enums\.js"/g, `from "${toEnums}"`);
  source = source.replace(/from "\.\.?\/[^"]*cipher\.view\.js"/g, `from "${toCipherView}"`);
  source = source.replace(/from "\.\.?\/[^"]*folder\.view\.js"/g, `from "${toFolderView}"`);
  source = source.replace(/from "\.\.?\/[^"]*bitwarden-export\.js"/g, `from "${toBitwardenExport}"`);
  source = source.replace(/from "\.\/([^"]+)"/g, (match, p1) => {
    if (p1.endsWith(".js") || p1.includes("/types/")) {
      return match;
    }
    const candidate = path.join(dir, p1);
    if (fs.existsSync(`${candidate}.ts`)) {
      return `from "./${p1}.js"`;
    }
    return match;
  });
  fs.writeFileSync(filePath, source);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith(".ts")) {
      fixFile(full);
    }
  }
}

walk(PORTED);
console.log("fixed imports in", PORTED);
