import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = process.env.PROVENANCE_OUT_DIR
  ? resolve(root, process.env.PROVENANCE_OUT_DIR)
  : join(root, ".artifacts", "crypto-provenance");
const trackedDirs = [
  join(root, "packages", "crypto", "dist"),
  join(root, "packages", "types", "dist"),
];

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

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

execFileSync("node", ["scripts/verify-crypto-bootstrap.mjs"], {
  cwd: root,
  stdio: "inherit",
});

const checksums = {};
for (const dir of trackedDirs) {
  for (const filePath of listFilesRecursively(dir)) {
    const rel = relative(root, filePath).replaceAll("\\", "/");
    checksums[rel] = sha256(filePath);
  }
}

mkdirSync(outputDir, { recursive: true });
const generatedAt = new Date().toISOString();
const provenance = {
  schema_version: 1,
  generated_at: generatedAt,
  git: {
    commit: run("git", ["rev-parse", "HEAD"]),
    branch: run("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
  },
  toolchain: {
    node: run("node", ["-v"]),
    yarn: run("yarn", ["-v"]),
    rustc: run("rustc", ["--version"]),
    cargo: run("cargo", ["--version"]),
    wasm_pack: run("wasm-pack", ["--version"]),
  },
  artifacts: checksums,
};

writeFileSync(join(outputDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

const checksumLines = Object.entries(checksums)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, hash]) => `${hash}  ${file}`);
writeFileSync(join(outputDir, "checksums.sha256"), `${checksumLines.join("\n")}\n`, "utf8");

console.log(`Generated provenance bundle at ${relative(root, outputDir)}.`);
