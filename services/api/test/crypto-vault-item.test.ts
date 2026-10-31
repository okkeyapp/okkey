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

test("vault-item: itemId AAD binds ciphertext; wrong itemId falls back only for legacy", async () => {
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

  const { encryptVaultItemPayload, decryptVaultItemPayload } = await import(
    "../../../packages/crypto/dist/vault-item.js"
  );

  const vaultKey = new Uint8Array(32);
  vaultKey.fill(0x42);
  const plaintext = new TextEncoder().encode("bound payload");
  const itemId = "1000000000000000001";

  const bound = await encryptVaultItemPayload(vaultKey, plaintext, 2, { itemId });
  const ok = await decryptVaultItemPayload(vaultKey, bound, 2, { itemId });
  assert.deepEqual(ok, plaintext);

  await assert.rejects(
    () =>
      decryptVaultItemPayload(vaultKey, bound, 2, {
        itemId: "1000000000000000002",
      }),
    /aead|decrypt|failed|mac|tag/i,
  );

  const legacy = await encryptVaultItemPayload(vaultKey, plaintext);
  const legacyRoundTrip = await decryptVaultItemPayload(vaultKey, legacy, 2, {
    itemId,
  });
  assert.deepEqual(legacyRoundTrip, plaintext);
});
