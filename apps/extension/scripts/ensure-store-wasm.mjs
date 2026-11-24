/**
 * Store zips import the wasm-pack glue from packages/crypto/dist.
 * A fresh `yarn install` only has the bootstrap package.json, so build the
 * engine when the glue module is missing.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(extensionRoot, "../..");
const glue = path.join(repoRoot, "packages/crypto/dist/okkey_crypto_engine.js");
const wasm = path.join(repoRoot, "packages/crypto/dist/okkey_crypto_engine_bg.wasm");

if (existsSync(glue) && existsSync(wasm)) {
  process.exit(0);
}

execFileSync("yarn", ["build:wasm"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH ?? ""}`,
  },
});
