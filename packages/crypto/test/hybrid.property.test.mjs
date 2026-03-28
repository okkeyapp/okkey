import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CryptoSdkError,
  decodeHybridEnvelope,
  decryptHybrid,
  generatePQKeys,
  getHybridEnvelopeConfig,
  initCrypto,
  x25519Keypair,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function makeRng(seed = 0x6d2b79f5) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function randomBytes(rng, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = Math.floor(rng() * 256);
  }
  return out;
}

test("property: decodeHybridEnvelope is deterministic for malformed/random input", () => {
  const rng = makeRng(0x51f15e);
  const cfg = getHybridEnvelopeConfig();

  for (let i = 0; i < 250; i += 1) {
    const len = Math.floor(rng() * (cfg.fixedHeaderLen + 128));
    const envelope = randomBytes(rng, len);
    try {
      const view = decodeHybridEnvelope(envelope);
      const viewAgain = decodeHybridEnvelope(envelope);
      assert.equal(view.eccEphemeralPublicKey.length, cfg.eccPublicKeyLen);
      assert.equal(view.pqCiphertext.length, cfg.pqCiphertextLen);
      assert.equal(view.nonce.length, cfg.nonceLen);
      assert.deepEqual(viewAgain.header, view.header);
      const encoded = new Uint8Array([
        view.header.version,
        view.header.kdfId,
        view.header.aeadId,
        view.header.reserved,
        ...view.eccEphemeralPublicKey,
        ...view.pqCiphertext,
        ...view.nonce,
        ...view.ciphertext,
      ]);
      assert.deepEqual(encoded, envelope);
    } catch (error) {
      assert.ok(error instanceof CryptoSdkError);
      assert.equal(error.code, "MALFORMED_ENVELOPE");
      assert.throws(
        () => decodeHybridEnvelope(envelope),
        (nextError) => nextError instanceof CryptoSdkError && nextError.code === "MALFORMED_ENVELOPE",
      );
    }
  }
});

test("property: decryptHybrid never crashes on random malformed envelopes", () => {
  const rng = makeRng(0x19a4cd);
  const recipientKeys = x25519Keypair();
  const recipientPrivateKey = recipientKeys.slice(0, 32);
  const pqKeys = generatePQKeys();
  const recipientPqPrivateKey = pqKeys.slice(0, 2400);
  const aad = new TextEncoder().encode("hybrid-property-aad");

  for (let i = 0; i < 200; i += 1) {
    const envelope = randomBytes(rng, Math.floor(rng() * 2048));
    try {
      void decryptHybrid(
        recipientPrivateKey,
        recipientPqPrivateKey,
        aad,
        envelope,
      );
    } catch (error) {
      assert.ok(error instanceof CryptoSdkError);
      assert.ok(
        ["MALFORMED_ENVELOPE", "DECRYPT_FAILED", "INVALID_KEY_LENGTH", "INTERNAL"].includes(error.code),
      );
    }
  }
});
