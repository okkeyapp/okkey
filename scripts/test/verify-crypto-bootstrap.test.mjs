import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(root, "scripts", "verify-crypto-bootstrap.mjs");

function runWithDistDir(distDir) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CRYPTO_WASM_DIST_DIR: distDir,
    },
  });
}

test("passes when wasm artifacts and non-bootstrap version exist", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "okkey-bootstrap-pass-"));
  const distDir = join(tempRoot, "dist");
  mkdirSync(distDir, { recursive: true });

  writeFileSync(
    join(distDir, "package.json"),
    `${JSON.stringify({ name: "@okkey/crypto-wasm", version: "0.0.1" })}\n`,
    "utf8",
  );
  writeFileSync(join(distDir, "okkey_crypto_engine_bg.wasm"), "wasm", "utf8");
  writeFileSync(join(distDir, "okkey_crypto_engine.js"), "js", "utf8");

  const result = runWithDistDir(distDir);
  rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap guard passed/i);
});

test("fails when bootstrap placeholder version remains", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "okkey-bootstrap-fail-"));
  const distDir = join(tempRoot, "dist");
  mkdirSync(distDir, { recursive: true });

  writeFileSync(
    join(distDir, "package.json"),
    `${JSON.stringify({ name: "@okkey/crypto-wasm", version: "0.0.0-bootstrap" })}\n`,
    "utf8",
  );
  writeFileSync(join(distDir, "okkey_crypto_engine_bg.wasm"), "wasm", "utf8");
  writeFileSync(join(distDir, "okkey_crypto_engine.js"), "js", "utf8");

  const result = runWithDistDir(distDir);
  rmSync(tempRoot, { recursive: true, force: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Bootstrap package is still present/i);
});
