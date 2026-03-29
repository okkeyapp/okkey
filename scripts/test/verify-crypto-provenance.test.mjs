import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(root, "scripts", "verify-crypto-provenance.mjs");

function runWithOutDir(outDir) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PROVENANCE_OUT_DIR: outDir,
    },
  });
}

test("passes for valid provenance bundle", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "okkey-provenance-pass-"));
  const outDir = join(tempRoot, "bundle");
  mkdirSync(outDir, { recursive: true });

  const artifacts = {
    "packages/crypto/dist/okkey_crypto_engine_bg.wasm": "abc123",
    "packages/types/dist/index.d.ts": "def456",
  };
  const provenance = {
    schema_version: 1,
    git: { commit: "deadbeef" },
    toolchain: { rustc: "rustc 1.86.0", wasm_pack: "wasm-pack 0.13.1" },
    artifacts,
  };

  writeFileSync(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  writeFileSync(
    join(outDir, "checksums.sha256"),
    "abc123  packages/crypto/dist/okkey_crypto_engine_bg.wasm\ndef456  packages/types/dist/index.d.ts\n",
    "utf8",
  );

  const result = runWithOutDir(outDir);
  rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Provenance validation passed/i);
});

test("fails for mismatched checksums", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "okkey-provenance-fail-"));
  const outDir = join(tempRoot, "bundle");
  mkdirSync(outDir, { recursive: true });

  const provenance = {
    schema_version: 1,
    git: { commit: "deadbeef" },
    toolchain: { rustc: "rustc 1.86.0", wasm_pack: "wasm-pack 0.13.1" },
    artifacts: {
      "packages/crypto/dist/okkey_crypto_engine_bg.wasm": "abc123",
    },
  };

  writeFileSync(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "checksums.sha256"), "fff999  packages/crypto/dist/okkey_crypto_engine_bg.wasm\n", "utf8");

  const result = runWithOutDir(outDir);
  rmSync(tempRoot, { recursive: true, force: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Checksum mismatch/i);
});
