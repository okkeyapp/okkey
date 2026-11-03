import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  __resetWasmInitForTests,
  __wasmInitSucceededForTests,
  initCrypto,
  ensureWasm,
} from "../dist/wasm-init.js";

const here = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(join(here, "../dist/okkey_crypto_engine_bg.wasm"));

test("pathful init + concurrent path-less ensureWasm both end ready", async () => {
  __resetWasmInitForTests();

  // Extension race: item decrypt ensureWasm() can start before initExtensionCrypto.
  // Microtask defer + sticky preferredPath must land both on the explicit bytes.
  const pathless = ensureWasm();
  const pathful = initCrypto({ module_or_path: wasmBytes });

  await Promise.all([pathless, pathful]);
  assert.equal(__wasmInitSucceededForTests(), true);

  await ensureWasm();
  assert.equal(__wasmInitSucceededForTests(), true);
});

test("ensureWasm reuses successful init without re-fetch", async () => {
  __resetWasmInitForTests();

  await initCrypto({ module_or_path: wasmBytes });
  assert.equal(__wasmInitSucceededForTests(), true);

  await ensureWasm();
  assert.equal(__wasmInitSucceededForTests(), true);
});
