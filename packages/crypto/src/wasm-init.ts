/**
 * Single shared WASM init gate for the whole `@okkey/crypto` package.
 *
 * Important for the browser extension: WXT rewrites `import.meta.url`, so the
 * wasm-bindgen default `new URL('*.wasm', import.meta.url)` path is wrong.
 * Extension code must call `initCrypto({ module_or_path: wasmAssetUrl })` once
 * before any crypto op (or `registerWasmModulePath` at module load).
 *
 * Concurrent callers: `ensureWasm()` (no path) often races `initCrypto(path)`
 * on popup open (items vs folders). We:
 * 1. remember a sticky `preferredPath` from any explicit init / register
 * 2. defer the actual `initWasm` by one microtask so a sibling pathful call can
 *    set `preferredPath` before a path-less start commits to the broken WXT URL
 * 3. retry with `preferredPath` after a failed attempt
 */
import initWasm from "@okkey/crypto-wasm";

let wasmReady: Promise<void> | undefined;
let preferredPath: unknown | undefined;
let wasmInitSucceeded = false;

function startInit(moduleOrPath: unknown | undefined): Promise<void> {
  return initWasm(moduleOrPath as Parameters<typeof initWasm>[0]).then(() => {
    wasmInitSucceeded = true;
  });
}

/**
 * Synchronously remember the WASM module URL/bytes. Call at extension module
 * load so concurrent `ensureWasm()` microtasks never start path-less.
 */
export function registerWasmModulePath(moduleOrPath: unknown): void {
  preferredPath = moduleOrPath;
}

export async function initCrypto(moduleOrPath?: unknown): Promise<void> {
  if (moduleOrPath !== undefined) {
    preferredPath = moduleOrPath;
  }

  if (wasmReady) {
    try {
      await wasmReady;
      if (wasmInitSucceeded) {
        return;
      }
    } catch {
      wasmReady = undefined;
      wasmInitSucceeded = false;
    }
  }

  if (!wasmReady) {
    // Microtask defer: lets a concurrent initCrypto(explicitPath) / register
    // set preferredPath before path-less ensureWasm commits to import.meta.url.
    const scheduledPath = preferredPath;
    wasmReady = Promise.resolve()
      .then(() => startInit(preferredPath !== undefined ? preferredPath : scheduledPath))
      .then(
        () => undefined,
        async (err: unknown) => {
          // If preferredPath appeared (or changed) after we failed, retry once.
          if (preferredPath !== undefined) {
            await startInit(preferredPath);
            return;
          }
          wasmReady = undefined;
          wasmInitSucceeded = false;
          throw err;
        },
      );
  }

  return wasmReady;
}

/** Await package WASM. Safe after `initCrypto(explicitPath)` in extension. */
export async function ensureWasm(): Promise<void> {
  return initCrypto();
}

/** Test/diagnostic helper — not part of the public crypto surface. */
export function __resetWasmInitForTests(): void {
  wasmReady = undefined;
  preferredPath = undefined;
  wasmInitSucceeded = false;
}

export function __wasmInitSucceededForTests(): boolean {
  return wasmInitSucceeded;
}
