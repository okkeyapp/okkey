import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  ED25519_SIGNATURE_LEN,
  MLDSA65_PUBLIC_KEY_LEN,
  MLDSA65_SEED_LEN,
  MLDSA65_SIGNATURE_LEN,
  buildHybridSignatureEnvelopeV1,
  buildHybridSignatureEnvelopeV2,
  decryptUserIdentityFromEncryptedBlob,
  encodeUserIdentityPrivateBundleV1,
  encodeUserIdentityPrivateBundleV2,
  encryptUserIdentityPrivateBundle,
  initCrypto,
  prepareMlDsaIdentityUpgrade,
  verifyHybridSignatureEnvelopeV1,
  verifyHybridSignatureEnvelopeV2,
  ed25519Keypair,
  mldsa65Keypair,
} from "../dist/index.js";
import { MLKEM768_DECAPSULATION_KEY_LEN } from "../dist/user-identity-bundle.js";

const wasmBytes = await readFile(new URL("../dist/okkey_crypto_engine_bg.wasm", import.meta.url));
await initCrypto({ module_or_path: wasmBytes });

const SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES = 512 * 1024;

function ed25519Pair() {
  const raw = ed25519Keypair();
  return { secret: raw.slice(0, 32), publicKey: raw.slice(32, 64) };
}

function mldsaPair() {
  const raw = mldsa65Keypair();
  return { seed: raw.slice(0, MLDSA65_SEED_LEN), publicKey: raw.slice(MLDSA65_SEED_LEN) };
}

test("hybrid signature v2 verifies only when both halves are intact", () => {
  const ed = ed25519Pair();
  const mldsa = mldsaPair();
  const pq = new Uint8Array(1184).fill(9);
  const payload = { vaultId: "v1", eventType: "ITEM_CREATE", encryptedBlob: { payload: "abc" } };
  const envelope = buildHybridSignatureEnvelopeV2({
    keyId: "user-1",
    context: "sync.append",
    payload,
    signerPrivateKey: ed.secret,
    signerMlDsaSeed: mldsa.seed,
    signerPqPublicKey: pq,
    signerMlDsaPublicKey: mldsa.publicKey,
    createdAt: "2026-11-04T00:00:00.000Z",
  });

  assert.equal(envelope.version, 2);
  assert.equal(envelope.algorithm, "hybrid_ed25519_ml_dsa_65_v2");
  assert.equal(verifyHybridSignatureEnvelopeV2({
    envelope,
    payload,
    signerPublicKey: ed.publicKey,
    signerMlDsaPublicKey: mldsa.publicKey,
  }), true);

  const tamperedEd = { ...envelope, signature: flipBase64(envelope.signature) };
  assert.equal(verifyHybridSignatureEnvelopeV2({
    envelope: tamperedEd,
    payload,
    signerPublicKey: ed.publicKey,
    signerMlDsaPublicKey: mldsa.publicKey,
  }), false);

  const tamperedMl = { ...envelope, mldsa_signature: flipBase64(envelope.mldsa_signature) };
  assert.equal(verifyHybridSignatureEnvelopeV2({
    envelope: tamperedMl,
    payload,
    signerPublicKey: ed.publicKey,
    signerMlDsaPublicKey: mldsa.publicKey,
  }), false);
});

test("hybrid signature v1 remains verifiable and is smaller than v2", () => {
  const ed = ed25519Pair();
  const mldsa = mldsaPair();
  const pq = new Uint8Array(1184).fill(3);
  const payload = { vaultId: "v1", eventType: "VAULT_SHARE", encryptedBlob: { payload: "hist" } };
  const createdAt = "2026-11-04T00:00:00.000Z";
  const v1 = buildHybridSignatureEnvelopeV1({
    keyId: "user-1",
    context: "vault.share",
    payload,
    signerPrivateKey: ed.secret,
    signerPqPublicKey: pq,
    createdAt,
  });
  const v2 = buildHybridSignatureEnvelopeV2({
    keyId: "user-1",
    context: "vault.share",
    payload,
    signerPrivateKey: ed.secret,
    signerMlDsaSeed: mldsa.seed,
    signerPqPublicKey: pq,
    signerMlDsaPublicKey: mldsa.publicKey,
    createdAt,
  });
  assert.equal(verifyHybridSignatureEnvelopeV1({
    envelope: v1,
    payload,
    signerPublicKey: ed.publicKey,
  }), true);

  const v1Bytes = Buffer.byteLength(JSON.stringify(v1));
  const v2Bytes = Buffer.byteLength(JSON.stringify(v2));
  assert.ok(v2Bytes > v1Bytes);
  assert.ok(v2Bytes < SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES);
  assert.equal(mldsa.publicKey.length, MLDSA65_PUBLIC_KEY_LEN);
  assert.equal(Buffer.from(v2.signature, "base64").length, ED25519_SIGNATURE_LEN);
  assert.equal(Buffer.from(v2.mldsa_signature, "base64").length, MLDSA65_SIGNATURE_LEN);
});

test("identity bundle v1 still decrypts and v2 round-trips the ML-DSA seed", async () => {
  const vaultKey = new Uint8Array(32).fill(8);
  const ed = new Uint8Array(32).fill(5);
  const mlkem = new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(6);
  const v1 = encodeUserIdentityPrivateBundleV1(ed, mlkem);
  const v1Blob = await encryptUserIdentityPrivateBundle(vaultKey, v1);
  const openedV1 = await decryptUserIdentityFromEncryptedBlob(vaultKey, Buffer.from(v1Blob).toString("base64"));
  assert.equal(openedV1.mldsa65Seed, null);
  assert.deepEqual(openedV1.ed25519SecretKey, ed);

  const seed = new Uint8Array(MLDSA65_SEED_LEN).fill(7);
  const v2 = encodeUserIdentityPrivateBundleV2(ed, mlkem, seed);
  const v2Blob = await encryptUserIdentityPrivateBundle(vaultKey, v2);
  const openedV2 = await decryptUserIdentityFromEncryptedBlob(vaultKey, Buffer.from(v2Blob).toString("base64"));
  assert.deepEqual(openedV2.mldsa65Seed, seed);
  assert.deepEqual(openedV2.mlkem768DecapsulationKey, mlkem);
});

test("prepareMlDsaIdentityUpgrade signs a bundle an Ed25519 identity key can authenticate", async () => {
  const ed = ed25519Pair();
  const vaultKey = new Uint8Array(32).fill(4);
  const mlkem = new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(2);
  const prepared = await prepareMlDsaIdentityUpgrade({
    vaultKey,
    userId: "user-42",
    ed25519SecretKey: ed.secret,
    mlkem768DecapsulationKey: mlkem,
  });
  assert.equal(prepared.publicKey.length, MLDSA65_PUBLIC_KEY_LEN);
  assert.equal(prepared.signature.length, ED25519_SIGNATURE_LEN);
  const opened = await decryptUserIdentityFromEncryptedBlob(
    vaultKey,
    prepared.encryptedPrivateKey.payload,
  );
  assert.equal(opened.mldsa65Seed?.length, MLDSA65_SEED_LEN);
  assert.deepEqual(opened.ed25519SecretKey, ed.secret);
});

function flipBase64(value) {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 0x01;
  return bytes.toString("base64");
}
