import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  decodeHybridEnvelope,
  encodeHybridEnvelope,
  encryptHybrid,
  getHybridEnvelopeConfig,
  initCrypto,
  sha256Digest,
  x25519Keypair,
  generatePQKeys,
} from "../dist/index.js";

const wasmBytes = await readFile(
  new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url),
);
await initCrypto({ module_or_path: wasmBytes });

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

test("contract: deterministic golden vector keeps binary envelope layout", async () => {
  const fixtureRaw = await readFile(
    new URL("./fixtures/hybrid-envelope-golden-v1.json", import.meta.url),
    "utf8",
  );
  const fixture = JSON.parse(fixtureRaw);
  const cfg = getHybridEnvelopeConfig();

  const envelope = encodeHybridEnvelope({
    header: fixture.header,
    eccEphemeralPublicKey: new Uint8Array(cfg.eccPublicKeyLen).fill(fixture.parts.eccFillByte),
    pqCiphertext: new Uint8Array(cfg.pqCiphertextLen).fill(fixture.parts.pqFillByte),
    nonce: new Uint8Array(cfg.nonceLen).fill(fixture.parts.nonceFillByte),
    ciphertext: Uint8Array.from(Buffer.from(fixture.parts.ciphertextHex, "hex")),
  });

  assert.equal(envelope.length, fixture.expectedEnvelopeLength);
  assert.equal(bytesToHex(sha256Digest(envelope)), fixture.expectedEnvelopeSha256Hex);

  const decoded = decodeHybridEnvelope(envelope);
  assert.deepEqual(decoded.header, fixture.header);
  assert.equal(decoded.eccEphemeralPublicKey.length, cfg.eccPublicKeyLen);
  assert.equal(decoded.pqCiphertext.length, cfg.pqCiphertextLen);
  assert.equal(decoded.nonce.length, cfg.nonceLen);
});

test("contract: Rust/WASM envelope decode+reencode remains byte-identical in TS", () => {
  const recipientKeys = x25519Keypair();
  const recipientPublicKey = recipientKeys.slice(32);
  const senderKeys = x25519Keypair();
  const senderPrivateKey = senderKeys.slice(0, 32);
  const pqKeys = generatePQKeys();
  const recipientPqPublicKey = pqKeys.slice(2400);

  const aad = new TextEncoder().encode("contract-aad");
  const plaintext = new TextEncoder().encode("contract-payload");

  const wasmEnvelope = encryptHybrid(
    senderPrivateKey,
    recipientPublicKey,
    recipientPqPublicKey,
    aad,
    plaintext,
  );

  const decoded = decodeHybridEnvelope(wasmEnvelope);
  const reencoded = encodeHybridEnvelope(decoded);
  assert.deepEqual(reencoded, wasmEnvelope);
});
