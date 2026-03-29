import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildHybridSignatureEnvelopeV1,
  CryptoSdkError,
  decodeHybridEnvelope,
  decryptHybrid,
  encryptHybrid,
  generatePQKeys,
  getHybridEnvelopeConfig,
  initCrypto,
  verifyHybridSignatureEnvelopeV1,
  ed25519Keypair,
  x25519Keypair,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

test("hybrid api round-trip and envelope decode", () => {
  const recipientKeys = x25519Keypair();
  const recipientPrivateKey = recipientKeys.slice(0, 32);
  const recipientPublicKey = recipientKeys.slice(32);
  const senderKeys = x25519Keypair();
  const senderPrivateKey = senderKeys.slice(0, 32);

  const pqKeys = generatePQKeys();
  const recipientPqPrivateKey = pqKeys.slice(0, 2400);
  const recipientPqPublicKey = pqKeys.slice(2400);

  const aad = new TextEncoder().encode("api-round-trip");
  const plaintext = new TextEncoder().encode("hello-v67");

  const envelope = encryptHybrid(
    senderPrivateKey,
    recipientPublicKey,
    recipientPqPublicKey,
    aad,
    plaintext,
  );
  const parsed = decodeHybridEnvelope(envelope);
  assert.equal(parsed.header.version, getHybridEnvelopeConfig().version);
  assert.equal(parsed.eccEphemeralPublicKey.length, 32);
  assert.equal(parsed.pqCiphertext.length, 1088);

  const decrypted = decryptHybrid(
    recipientPrivateKey,
    recipientPqPrivateKey,
    aad,
    envelope,
  );
  assert.equal(new TextDecoder().decode(decrypted), "hello-v67");
});

test("hybrid api returns typed errors", () => {
  const recipientKeys = x25519Keypair();
  const recipientPrivateKey = recipientKeys.slice(0, 32);
  const recipientPublicKey = recipientKeys.slice(32);
  const senderKeys = x25519Keypair();
  const senderPrivateKey = senderKeys.slice(0, 32);
  const pqKeys = generatePQKeys();
  const recipientPqPrivateKey = pqKeys.slice(0, 2400);
  const recipientPqPublicKey = pqKeys.slice(2400);

  const aad = new TextEncoder().encode("api-errors");
  const plaintext = new TextEncoder().encode("hello-v67-errors");

  const envelope = encryptHybrid(
    senderPrivateKey,
    recipientPublicKey,
    recipientPqPublicKey,
    aad,
    plaintext,
  );
  envelope[0] = 0xff;

  assert.throws(
    () => decryptHybrid(recipientPrivateKey, recipientPqPrivateKey, aad, envelope),
    (err) => err instanceof CryptoSdkError && err.code === "MALFORMED_ENVELOPE",
  );
});

test("hybrid signature envelope sign/verify", () => {
  const identity = ed25519Keypair();
  const signerPrivateKey = identity.slice(0, 32);
  const signerPublicKey = identity.slice(32);
  const pqKeys = generatePQKeys();
  const signerPqPublicKey = pqKeys.slice(2400);
  const payload = {
    vaultId: "vault-1",
    eventType: "VAULT_SHARE",
    encryptedBlob: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: "YQ==",
      meta: { entity: "vault_event_payload", event_type: "VAULT_SHARE" },
    },
  };
  const envelope = buildHybridSignatureEnvelopeV1({
    keyId: "key-1",
    context: "vault.share",
    payload,
    signerPrivateKey,
    signerPqPublicKey,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(envelope.algorithm, "hybrid_ed25519_pq_bind_v1");
  assert.equal(
    verifyHybridSignatureEnvelopeV1({
      envelope,
      payload,
      signerPublicKey,
    }),
    true,
  );
  assert.equal(
    verifyHybridSignatureEnvelopeV1({
      envelope,
      payload: { ...payload, vaultId: "vault-2" },
      signerPublicKey,
    }),
    false,
  );
});
