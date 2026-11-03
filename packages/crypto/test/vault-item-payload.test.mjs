import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CryptoSdkError,
  decryptVaultItemPayload,
  encryptVaultItemPayload,
  initCrypto,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function vaultKey() {
  const key = new Uint8Array(32);
  key.fill(0x42);
  return key;
}

test("vault item payload round-trips under VaultKey and is not deterministic", async () => {
  const key = vaultKey();
  const plaintext = new TextEncoder().encode('{"schemaVersion":2,"title":"login"}');

  const first = await encryptVaultItemPayload(key, plaintext);
  const second = await encryptVaultItemPayload(key, plaintext);
  assert.ok(first.length > 24);
  assert.equal(Buffer.from(first).equals(Buffer.from(second)), false);

  const opened = await decryptVaultItemPayload(key, first);
  assert.deepEqual(opened, plaintext);
});

test("vault item payload rejects a wrong VaultKey and a flipped ciphertext byte", async () => {
  const key = vaultKey();
  const plaintext = new TextEncoder().encode("secret-item");
  const ciphertext = await encryptVaultItemPayload(key, plaintext);

  const wrong = new Uint8Array(key);
  wrong[0] ^= 0xff;
  await assert.rejects(() => decryptVaultItemPayload(wrong, ciphertext));

  const tampered = new Uint8Array(ciphertext);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(() => decryptVaultItemPayload(key, tampered));

  await assert.rejects(
    () => decryptVaultItemPayload(key, ciphertext.subarray(0, 8)),
    /too short|invalid vault item ciphertext/i,
  );
});

test("vault item writes require the qday profile", async () => {
  // docs/release_policy_qday.md + vault-item.ts: production item writes are v2 only.
  const key = vaultKey();
  const plaintext = new TextEncoder().encode("item");

  await assert.rejects(
    () => encryptVaultItemPayload(key, plaintext, 1),
    (err) => {
      assert.ok(err instanceof CryptoSdkError);
      assert.equal(err.code, "UNSUPPORTED_ALGORITHM");
      return true;
    },
  );

  const ciphertext = await encryptVaultItemPayload(key, plaintext, 2);
  await assert.rejects(
    () => decryptVaultItemPayload(key, ciphertext, 99),
    (err) => {
      assert.ok(err instanceof CryptoSdkError);
      assert.equal(err.code, "UNSUPPORTED_ALGORITHM");
      return true;
    },
  );
});
