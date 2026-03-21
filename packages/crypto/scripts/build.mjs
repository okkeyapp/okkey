import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const rustDir = join(root, "rust", "crypto-engine");
const outDir = join(root, "packages", "crypto", "dist");
const pkgDir = join(root, "packages", "crypto");
const wasmPackBin = process.env.WASM_PACK_BIN || "wasm-pack";

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync(wasmPackBin, ["build", "--target", "web", "--out-dir", outDir, "--features", "wasm"], {
  cwd: rustDir,
  stdio: "inherit",
});

const pkgPath = join(outDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = "@okkey/crypto-wasm";
pkg.type = "module";
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

execFileSync("npx", ["--yes", "-p", "typescript", "tsc", "-p", "tsconfig.json"], {
  cwd: pkgDir,
  stdio: "inherit",
});
