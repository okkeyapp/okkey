import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = process.env.PROVENANCE_OUT_DIR
  ? resolve(root, process.env.PROVENANCE_OUT_DIR)
  : join(root, ".artifacts", "crypto-provenance");
const provenancePath = join(outputDir, "provenance.json");
const checksumsPath = join(outputDir, "checksums.sha256");

if (!existsSync(provenancePath)) {
  throw new Error(`Missing provenance file: ${provenancePath}`);
}
if (!existsSync(checksumsPath)) {
  throw new Error(`Missing checksums file: ${checksumsPath}`);
}

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
if (provenance.schema_version !== 1) {
  throw new Error("Unsupported provenance schema_version.");
}
if (!provenance.git?.commit) {
  throw new Error("Missing git.commit in provenance.");
}
if (!provenance.toolchain?.rustc || !provenance.toolchain?.wasm_pack) {
  throw new Error("Missing toolchain details in provenance.");
}
if (!provenance.artifacts || Object.keys(provenance.artifacts).length === 0) {
  throw new Error("Missing artifacts checksum map in provenance.");
}

const checksumLines = readFileSync(checksumsPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (checksumLines.length !== Object.keys(provenance.artifacts).length) {
  throw new Error("checksums.sha256 and provenance artifact map size mismatch.");
}

for (const line of checksumLines) {
  const [hash, file] = line.split(/\s{2,}/);
  if (!hash || !file) {
    throw new Error(`Malformed checksum line: ${line}`);
  }
  if (provenance.artifacts[file] !== hash) {
    throw new Error(`Checksum mismatch for ${file}`);
  }
}

console.log("Provenance validation passed.");
