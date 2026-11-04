import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync, mlkem768_encapsulation_key_len } from "@okkey/crypto-wasm";

let ready = false;

function wasmFilePath(): string {
  const candidates = [
    fileURLToPath(new URL("../../../../packages/crypto/dist/okkey_crypto_engine_bg.wasm", import.meta.url)),
  ];
  try {
    const pkgJson = import.meta.resolve("@okkey/crypto-wasm/package.json");
    candidates.unshift(fileURLToPath(new URL("./okkey_crypto_engine_bg.wasm", pkgJson)));
  } catch {
    // Package exports may not expose package.json; the repo-relative path remains.
  }
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error("crypto wasm module was not found");
  }
  return found;
}

/** Load the crypto-engine WASM once for API signature checks. */
export function ensureApiCryptoWasm(): void {
  if (ready) {
    return;
  }
  try {
    mlkem768_encapsulation_key_len();
    ready = true;
    return;
  } catch {
    // Module import does not initialize WASM.
  }
  initSync(readFileSync(wasmFilePath()));
  ready = true;
}
