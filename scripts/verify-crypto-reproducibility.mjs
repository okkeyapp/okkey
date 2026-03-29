import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const trackedDirs = [
  join(root, "packages", "crypto", "dist"),
  join(root, "packages", "types", "dist"),
];

function listFilesRecursively(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const result = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  return result.sort();
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function collectManifest() {
  const manifest = {};
  for (const dir of trackedDirs) {
    for (const filePath of listFilesRecursively(dir)) {
      const rel = relative(root, filePath).replaceAll("\\", "/");
      manifest[rel] = sha256(filePath);
    }
  }
  return manifest;
}

function cleanArtifacts() {
  rmSync(join(root, "packages", "crypto", "dist"), { recursive: true, force: true });
  rmSync(join(root, "packages", "types", "dist"), { recursive: true, force: true });
}

function runBuild() {
  const env = {
    ...process.env,
    SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? "1704067200",
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
  };
  execFileSync("yarn", ["build:wasm"], {
    cwd: root,
    stdio: "inherit",
    env,
  });
}

function verifyBootstrap() {
  execFileSync("node", ["scripts/verify-crypto-bootstrap.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

function diffManifests(first, second) {
  const allKeys = new Set([...Object.keys(first), ...Object.keys(second)]);
  const diffs = [];
  for (const key of [...allKeys].sort()) {
    if (first[key] !== second[key]) {
      diffs.push({ file: key, first: first[key] ?? null, second: second[key] ?? null });
    }
  }
  return diffs;
}

cleanArtifacts();
runBuild();
verifyBootstrap();
const first = collectManifest();

cleanArtifacts();
runBuild();
verifyBootstrap();
const second = collectManifest();

const diffs = diffManifests(first, second);
if (diffs.length > 0) {
  console.error("Reproducibility check failed. Hash mismatch detected:");
  for (const diff of diffs) {
    console.error(`- ${diff.file}`);
    console.error(`  first : ${diff.first}`);
    console.error(`  second: ${diff.second}`);
  }
  process.exit(1);
}

console.log(`Reproducibility check passed for ${Object.keys(second).length} files.`);
