import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = process.env.CRYPTO_WASM_DIST_DIR
  ? resolve(root, process.env.CRYPTO_WASM_DIST_DIR)
  : resolve(root, "packages", "crypto", "dist");
const pkgPath = resolve(distDir, "package.json");
const wasmPath = resolve(distDir, "okkey_crypto_engine_bg.wasm");
const jsPath = resolve(distDir, "okkey_crypto_engine.js");

if (!existsSync(pkgPath)) {
  throw new Error(`Missing ${pkgPath}; run yarn build:wasm first.`);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.version === "0.0.0-bootstrap") {
  throw new Error("Bootstrap package is still present after build.");
}
if (pkg.name !== "@okkey/crypto-wasm") {
  throw new Error(`Unexpected package name: ${pkg.name}`);
}
if (!existsSync(wasmPath) || !existsSync(jsPath)) {
  throw new Error("Real wasm artifacts are missing; bootstrap dist is not allowed.");
}

console.log("Crypto WASM bootstrap guard passed.");
