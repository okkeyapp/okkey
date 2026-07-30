import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  generatePQKeys,
  generateSharedVaultKey,
  initCrypto,
  unwrapVaultKeyForSelf,
  wrapVaultKeyForRecipient,
  x25519Keypair,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

test("vault key wrap/unwrap round-trip with recipient PQ identity", async () => {
  const vaultKey = await generateSharedVaultKey();
  assert.equal(vaultKey.length, 32);

  const sender = x25519Keypair();
  const senderPrivateKey = sender.slice(0, 32);
  const recipientEcc = x25519Keypair();
  const pq = generatePQKeys();
  const recipientPqPrivateKey = pq.slice(0, 2400);
  const recipientPqPublicKey = pq.slice(2400);

  const wrapped = await wrapVaultKeyForRecipient({
    vaultKey,
    recipientUserId: "1234567890123456789",
    senderPrivateKey,
    recipientPublicKey: recipientEcc.slice(32),
    recipientPqPublicKey,
  });

  assert.equal(wrapped.crypto_version, 2);
  assert.equal(wrapped.meta.key_wrap_scheme, "hybrid_ecc_pq_v1");

  const unwrapped = await unwrapVaultKeyForSelf({
    encryptedVaultKey: wrapped,
    recipientPrivateKey: recipientEcc.slice(0, 32),
    recipientPqPrivateKey,
  });

  assert.deepEqual(unwrapped, vaultKey);
});
