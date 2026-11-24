import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CryptoSdkError,
  decryptVaultItemPayload,
  encryptVaultItemPayload,
  initCrypto,
} from "../dist/index.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

function vaultKey() {
  return new Uint8Array(32).fill(0x42);
}

test("vault item v2 round trip", async () => {
  const key = vaultKey();
  const plaintext = new TextEncoder().encode("round-trip payload");
  const ciphertext = await encryptVaultItemPayload(key, plaintext, 2);
  assert.ok(ciphertext.length > 24);
  const roundTrip = await decryptVaultItemPayload(key, ciphertext, 2);
  assert.deepEqual(roundTrip, plaintext);
});

test("vault item write rejects crypto profile v1", async () => {
  await assert.rejects(
    () => encryptVaultItemPayload(vaultKey(), new Uint8Array([1]), 1),
    (err) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /vault item write path requires qday profile, got v1/.test(err.message),
  );
});

test("vault item read rejects crypto profile v1", async () => {
  const key = vaultKey();
  const ciphertext = await encryptVaultItemPayload(key, new TextEncoder().encode("payload"), 2);
  await assert.rejects(
    () => decryptVaultItemPayload(key, ciphertext, 1),
    (err) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /vault item read path requires qday profile, got v1/.test(err.message),
  );
});

test("vault item read rejects unknown crypto profile", async () => {
  const key = vaultKey();
  const ciphertext = await encryptVaultItemPayload(key, new TextEncoder().encode("payload"), 2);
  await assert.rejects(
    () => decryptVaultItemPayload(key, ciphertext, 99),
    (err) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /unsupported crypto profile version: v99/.test(err.message),
  );
});
