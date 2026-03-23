import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";

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
});
