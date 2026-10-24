import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import { CryptoSdkError } from "../../../packages/crypto/dist/index.js";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");

test("vault-item: encrypt/decrypt round-trip with fixed VaultKey (WASM initSync)", async () => {
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

  const { encryptVaultItemPayload, decryptVaultItemPayload } = await import(
    "../../../packages/crypto/dist/vault-item.js"
  );

  const vaultKey = new Uint8Array(32);
  vaultKey.fill(0x42);
  const plaintext = new TextEncoder().encode("round-trip payload");

  const ciphertext = await encryptVaultItemPayload(vaultKey, plaintext);
  assert.ok(ciphertext.length > 24, "nonce + tag expected");

  const roundTrip = await decryptVaultItemPayload(vaultKey, ciphertext);
  assert.deepEqual(roundTrip, plaintext);

  await assert.rejects(
    () => decryptVaultItemPayload(vaultKey, new Uint8Array(8)),
    /invalid vault item ciphertext|too short/i,
  );

  await assert.rejects(
    () => encryptVaultItemPayload(vaultKey, plaintext, 1),
    (err: unknown) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /vault item write path requires qday profile, got v1/.test(err.message),
  );

  await assert.rejects(
    () => decryptVaultItemPayload(vaultKey, ciphertext, 1),
    (err: unknown) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /vault item read path requires qday profile, got v1/.test(err.message),
  );

  await assert.rejects(
    () => decryptVaultItemPayload(vaultKey, ciphertext, 99),
    (err: unknown) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      /unsupported crypto profile version: v99/.test(err.message),
  );
});
