/**
 * Yarn resolves `file:./packages/crypto/dist` before install scripts run.
 * Fresh clones have no `dist/` until `yarn build:wasm` (wasm-pack). CI must
 * create a minimal package so `yarn install --frozen-lockfile` succeeds; real
 * artifacts are produced by `build:wasm` before tests.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "packages", "crypto", "dist");
const pkgPath = join(distDir, "package.json");

function distLooksBootstrapped() {
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.name === "@okkey/crypto-wasm" && typeof pkg.version === "string";
  } catch {
    return false;
  }
}

if (distLooksBootstrapped()) {
  process.exit(0);
}

mkdirSync(distDir, { recursive: true });
writeFileSync(
  pkgPath,
  `${JSON.stringify(
    {
      name: "@okkey/crypto-wasm",
      version: "0.0.0-bootstrap",
      type: "module",
      description: "Placeholder until wasm-pack runs (yarn build:wasm)",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
