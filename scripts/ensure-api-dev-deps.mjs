/**
 * Fresh clones have no package `dist/` outputs. `yarn dev:api` needs:
 * - real `@okkey/crypto` WASM (`yarn build:wasm`, also emits id/types)
 * - `@okkey/id` / `@okkey/types` / `@okkey/sync` (`yarn build:ts-sdk`)
 * - email packages (`yarn build:email`)
 *
 * WASM is built only when artifacts are missing so restarts stay cheap.
 * Concurrent `yarn dev:api` + `yarn dev:worker` share a lock so wasm-pack
 * does not race on `packages/crypto/dist`.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withDevDepsLock } from "./lib/dev-deps-lock.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "node_modules", ".cache", "okkey", "ensure-api-dev-deps.lock");

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

withDevDepsLock(
  lockPath,
  () => {
    if (!hasRealCryptoWasm()) {
      yarn("build:wasm");
    }

    yarn("build:ts-sdk");
    yarn("build:email");
  },
  {
    onWait: () => {
      console.log("waiting for another process to finish ensure-api-dev-deps…");
    },
  },
);
