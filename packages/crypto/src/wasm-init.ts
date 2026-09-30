/**
 * Single shared WASM init gate for the whole `@okkey/crypto` package.
 *
 * Important for the browser extension: WXT rewrites `import.meta.url`, so the
 * wasm-bindgen default `new URL('*.wasm', import.meta.url)` path is wrong.
 * Extension code must call `initCrypto({ module_or_path: wasmAssetUrl })` once
 * before any crypto op. A shared gate prevents per-file `initWasm()` races from
 * sticking helpers on a rejected path-less init after the explicit init succeeds.
 */
import initWasm from "@okkey/crypto-wasm";

let wasmReady: Promise<void> | undefined;

export async function initCrypto(moduleOrPath?: unknown): Promise<void> {
  if (wasmReady) {
    try {
      await wasmReady;
      return;
    } catch {
      // Prior attempt failed (often path-less fetch under WXT). Allow retry,
      // especially with an explicit module_or_path from the extension.
      wasmReady = undefined;
    }
  }
  wasmReady = initWasm(moduleOrPath as Parameters<typeof initWasm>[0]).then(() => undefined);
  return wasmReady;
}

/** Await package WASM. Safe after `initCrypto(explicitPath)` in extension. */
export async function ensureWasm(): Promise<void> {
  return initCrypto();
}
