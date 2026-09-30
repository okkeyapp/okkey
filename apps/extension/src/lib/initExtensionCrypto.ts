import { initCrypto, registerWasmModulePath } from "@okkey/crypto";
// WXT rewrites `import.meta.url` → `self.location.href` (service-worker safety),
// which breaks wasm-bindgen's default `new URL('*.wasm', import.meta.url)`.
// Pass an explicit Vite-emitted asset URL instead.
import wasmUrl from "../../../../packages/crypto/dist/okkey_crypto_engine_bg.wasm?url";

// Register synchronously at module evaluate so any concurrent ensureWasm()
// microtask (items decrypt) sees the extension asset URL before path-less init.
registerWasmModulePath({ module_or_path: wasmUrl });

let ready: Promise<void> | undefined;

/** Initialize `@okkey/crypto` WASM for extension pages (popup / callback). */
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
