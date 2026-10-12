import { initCrypto, registerWasmModulePath } from "@okkey/crypto";

/**
 * MV3 service-worker CSP (`connect-src 'self' http: https:`) blocks
 * `fetch("data:application/wasm;base64,...")`. Vite inlines `*.wasm?url` as a
 * data URL inside the background bundle, so we load a stable `public/` asset
 * via `runtime.getURL` instead (same pattern as overlay fonts/icons).
 */
function extensionWasmUrl(): string {
  return (browser.runtime.getURL as (path: string) => string)(
    "/okkey_crypto_engine_bg.wasm",
  );
}

const wasmUrl = extensionWasmUrl();

// Register synchronously at module evaluate so any concurrent ensureWasm()
// microtask (items decrypt) sees the extension asset URL before path-less init.
registerWasmModulePath(wasmUrl);

let ready: Promise<void> | undefined;

/** Initialize `@okkey/crypto` WASM for extension pages (popup / background). */
export function initExtensionCrypto(): Promise<void> {
  if (!ready) {
    ready = initCrypto({ module_or_path: wasmUrl }).then(
      () => undefined,
      (err: unknown) => {
        // Allow retry on next call (first attempt may race a path-less ensureWasm).
        ready = undefined;
        throw err;
      },
    );
  }
  return ready;
}
