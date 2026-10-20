import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  b64Encode,
  ed25519Keypair,
  ed25519PublicToX25519,
  encryptHybrid,
  generatePQKeys,
  generateSharedVaultKey,
  initCrypto,
  INTERIM_STATIC_ECC_MODE,
  PER_USER_ECC_MODE,
  unwrapVaultKeyForSelf,
  VAULT_KEY_WRAP_AAD,
  wrapVaultKeyForRecipient,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

/** RFC7748 Alice — legacy interim ECC (unwrap-only path). */
const INTERIM_ECC_PRIVATE = Uint8Array.from([
  0x77, 0x07, 0x6d, 0x0a, 0x73, 0x18, 0xa5, 0x7d, 0x3c, 0x16, 0xc1, 0x72, 0x51, 0xb2, 0x66, 0x45,
  0xdf, 0x4c, 0x2f, 0x87, 0xeb, 0xc0, 0x99, 0x2a, 0xb1, 0x77, 0xfb, 0xa5, 0x1d, 0xb9, 0x2c, 0x2a,
]);
const INTERIM_ECC_PUBLIC = Uint8Array.from([
  0x85, 0x20, 0xf0, 0x09, 0x89, 0x30, 0xa7, 0x54, 0x74, 0x8b, 0x7d, 0xdc, 0xb4, 0x3e, 0xf7, 0x5a,
  0x0d, 0xbf, 0x3a, 0x0d, 0x26, 0x38, 0x1a, 0xf4, 0xeb, 0xa4, 0xa9, 0x8e, 0xaa, 0x9b, 0x4e, 0x6a,
]);

test("vault key wrap/unwrap round-trip with per-user Ed25519→X25519 + PQ", async () => {
  const vaultKey = await generateSharedVaultKey();
  assert.equal(vaultKey.length, 32);

  const recipientEd = ed25519Keypair();
  const recipientEdSk = recipientEd.slice(0, 32);
  const recipientEdPk = recipientEd.slice(32, 64);
  const senderEd = ed25519Keypair();
  const pq = generatePQKeys();
  const recipientPqPrivateKey = pq.slice(0, 2400);
  const recipientPqPublicKey = pq.slice(2400);

  const wrapped = await wrapVaultKeyForRecipient({
    vaultKey,
    recipientUserId: "1234567890123456789",
    senderPrivateKey: senderEd.slice(0, 32),
    recipientPublicKey: recipientEdPk,
    recipientPqPublicKey,
  });

  assert.equal(wrapped.crypto_version, 2);
  assert.equal(wrapped.meta.key_wrap_scheme, "hybrid_ecc_pq_v1");
  assert.equal(wrapped.meta.ecc_mode, PER_USER_ECC_MODE);

  const unwrapped = await unwrapVaultKeyForSelf({
    encryptedVaultKey: wrapped,
    recipientPrivateKey: recipientEdSk,
    recipientPqPrivateKey,
  });

  assert.deepEqual(unwrapped, vaultKey);
});

test("per-user wrap rejects wrong recipient Ed25519 secret", async () => {
  const vaultKey = await generateSharedVaultKey();
  const recipientEd = ed25519Keypair();
  const wrongEd = ed25519Keypair();
  const pq = generatePQKeys();

  const wrapped = await wrapVaultKeyForRecipient({
    vaultKey,
    recipientUserId: "1",
    senderPrivateKey: recipientEd.slice(0, 32),
    recipientPublicKey: recipientEd.slice(32, 64),
    recipientPqPublicKey: pq.slice(2400),
  });

  await assert.rejects(
    () =>
      unwrapVaultKeyForSelf({
        encryptedVaultKey: wrapped,
        recipientPrivateKey: wrongEd.slice(0, 32),
        recipientPqPrivateKey: pq.slice(0, 2400),
      }),
    /decrypt|DECRYPT|aead|failed/i,
  );
});

test("legacy interim_static_v1 wrap still unwraps with Alice ECC", async () => {
  const vaultKey = await generateSharedVaultKey();
  const pq = generatePQKeys();
  const recipientPqPrivateKey = pq.slice(0, 2400);
  const recipientPqPublicKey = pq.slice(2400);

  // Simulate pre-migration wrap: ECDH to Alice public + recipient PQ.
  const envelope = encryptHybrid(
    INTERIM_ECC_PRIVATE,
    INTERIM_ECC_PUBLIC,
    recipientPqPublicKey,
    VAULT_KEY_WRAP_AAD,
    vaultKey,
  );
  const legacyBlob = {
    crypto_version: 2,
    algorithm: "opaque",
    payload: b64Encode(envelope),
    meta: {
      key_wrap_scheme: "hybrid_ecc_pq_v1",
      entity: "vault_key_wrap",
      recipient_user_id: "legacy",
      ecc_mode: INTERIM_STATIC_ECC_MODE,
    },
  };

  const unwrapped = await unwrapVaultKeyForSelf({
    encryptedVaultKey: legacyBlob,
    recipientPrivateKey: new Uint8Array(32), // ignored for interim
    recipientPqPrivateKey,
  });
  assert.deepEqual(unwrapped, vaultKey);
});

test("ed25519PublicToX25519 rejects wrong length", () => {
  assert.throws(() => ed25519PublicToX25519(new Uint8Array(31)), /32 bytes|ed25519/i);
});
