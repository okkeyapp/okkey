/**
 * Fresh clones have no package `dist/` outputs. `yarn dev:api` needs:
 * - real `@okkey/crypto` WASM (`yarn build:wasm`, also emits id/types)
 * - `@okkey/id` / `@okkey/types` / `@okkey/sync` (`yarn build:ts-sdk`)
 * - email packages (`yarn build:email`)
 *
 * WASM is built only when artifacts are missing so restarts stay cheap.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function yarn(script) {
  const result = spawnSync("yarn", [script], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasRealCryptoWasm() {
  const distDir = join(root, "packages", "crypto", "dist");
  const pkgPath = join(distDir, "package.json");
  const wasmPath = join(distDir, "okkey_crypto_engine_bg.wasm");
  const jsPath = join(distDir, "okkey_crypto_engine.js");
  const indexPath = join(distDir, "index.js");
  if (!existsSync(pkgPath) || !existsSync(wasmPath) || !existsSync(jsPath) || !existsSync(indexPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.name === "@okkey/crypto-wasm" && pkg.version !== "0.0.0-bootstrap";
  } catch {
    return false;
  }
}

if (!hasRealCryptoWasm()) {
  yarn("build:wasm");
}

yarn("build:ts-sdk");
yarn("build:email");
