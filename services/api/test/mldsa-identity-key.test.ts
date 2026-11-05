import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import { testEntityId } from "./test-entity-id.ts";
import { loadConfig } from "../src/config.ts";
import { MldsaIdentityKeyError, MldsaIdentityKeyService } from "../src/account/mldsa-identity-key.ts";
import {
  checkHybridSignatureForNewWrite,
  verifyHybridSignatureForPayload,
} from "../src/crypto/hybrid-signature.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { applyMigrations, cleanupUserData } from "./two-factor-test-helpers.ts";
import {
  MLKEM768_DECAPSULATION_KEY_LEN,
  buildHybridSignatureEnvelopeV1,
  buildHybridSignatureEnvelopeV2,
  decryptUserIdentityFromEncryptedBlob,
  ed25519Keypair,
  mldsa65Keypair,
  prepareMlDsaIdentityUpgrade,
} from "../../../packages/crypto/dist/index.js";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));

function ed25519Pair() {
  const raw = ed25519Keypair();
  return { secret: raw.slice(0, 32), publicKey: raw.slice(32, 64) };
}

function mldsaPair() {
  const raw = mldsa65Keypair();
  return { seed: raw.slice(0, 32), publicKey: raw.slice(32) };
}

test("new writes reject historical v1 envelopes while payload verification still accepts them", () => {
  const ed = ed25519Pair();
  const pq = new Uint8Array(1184).fill(6);
  const payload = { vaultId: "1000000000000000002", eventType: "ITEM_UPDATE", encryptedBlob: { payload: "e" } };
  const v1 = buildHybridSignatureEnvelopeV1({
    keyId: "k1",
    context: "sync.append",
    payload,
    signerPrivateKey: ed.secret,
    signerPqPublicKey: pq,
    createdAt: "2026-11-04T00:00:00.000Z",
  });
  assert.equal(verifyHybridSignatureForPayload({
    envelope: v1,
    payload,
    signerPublicKeyBase64: Buffer.from(ed.publicKey).toString("base64"),
  }), true);

  const rejected = checkHybridSignatureForNewWrite({
    signature: v1,
    expectedContext: "sync.append",
    payload,
    signerPublicKeyBase64: Buffer.from(ed.publicKey).toString("base64"),
    signerPqPublicKeyBase64: Buffer.from(pq).toString("base64"),
    signerMldsaPublicKeyBase64: null,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.code, "CLIENT_UPGRADE_REQUIRED");
    assert.equal(rejected.statusCode, 426);
  }
});

test("new writes accept an ML-DSA-65 hybrid envelope when both halves verify", () => {
  const ed = ed25519Pair();
  const mldsa = mldsaPair();
  const pq = new Uint8Array(1184).fill(8);
  const payload = { vaultId: "1000000000000000002", eventType: "ITEM_UPDATE", encryptedBlob: { payload: "e" } };
  const envelope = buildHybridSignatureEnvelopeV2({
    keyId: "k2",
    context: "sync.append",
    payload,
    signerPrivateKey: ed.secret,
    signerMlDsaSeed: mldsa.seed,
    signerPqPublicKey: pq,
    signerMlDsaPublicKey: mldsa.publicKey,
    createdAt: "2026-11-04T00:00:00.000Z",
  });
  const pqB64 = Buffer.from(pq).toString("base64");
  const mldsaB64 = Buffer.from(mldsa.publicKey).toString("base64");
  const accepted = checkHybridSignatureForNewWrite({
    signature: envelope,
    expectedContext: "sync.append",
    payload,
    signerPublicKeyBase64: Buffer.from(ed.publicKey).toString("base64"),
    signerPqPublicKeyBase64: pqB64,
    signerMldsaPublicKeyBase64: mldsaB64,
  });
  assert.equal(accepted.ok, true);

  const tampered = { ...envelope, mldsa_signature: flipBase64(envelope.mldsa_signature) };
  const rejected = checkHybridSignatureForNewWrite({
    signature: tampered,
    expectedContext: "sync.append",
    payload,
    signerPublicKeyBase64: Buffer.from(ed.publicKey).toString("base64"),
    signerPqPublicKeyBase64: pqB64,
    signerMldsaPublicKeyBase64: mldsaB64,
  });
  assert.equal(rejected.ok, false);
});

test("identity key upload accepts an Ed25519-authenticated bundle and rejects a different key", async () => {
  const ed = ed25519Pair();
  const vaultKey = new Uint8Array(32).fill(12);
  let storedKey: string | null = null;
  let storedBlob: Uint8Array | null = null;
  const users = {
    async findById() {
      return {
        id: "1000000000000000001",
        email: "mldsa@okkey.local",
        publicKey: Buffer.from(ed.publicKey).toString("base64"),
        publicPqKey: Buffer.alloc(1184, 3).toString("base64"),
        publicMldsaKey: storedKey,
        locale: "en",
        createdAt: "",
        updatedAt: "",
      };
    },
    async setMlDsaIdentityKey(_userId: string, input: { publicMldsaKey: string; encryptedPrivateKey: Uint8Array }) {
      if (storedKey && storedKey !== input.publicMldsaKey) {
        return "conflict" as const;
      }
      storedKey = input.publicMldsaKey;
      storedBlob = input.encryptedPrivateKey;
      return "stored" as const;
    },
  };
  const prepared = await prepareMlDsaIdentityUpgrade({
    vaultKey,
    userId: "1000000000000000001",
    ed25519SecretKey: ed.secret,
    mlkem768DecapsulationKey: new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(9),
  });
  const service = new MldsaIdentityKeyService(users);
  const stored = await service.upload({
    userId: "1000000000000000001",
    publicKeyBase64: Buffer.from(prepared.publicKey).toString("base64"),
    encryptedPrivateKey: prepared.encryptedPrivateKey,
    signatureBase64: Buffer.from(prepared.signature).toString("base64"),
  });
  assert.equal(stored.status, "stored");
  assert.ok(storedBlob);
  const blob = JSON.parse(Buffer.from(storedBlob!).toString("utf8")) as { payload: string };
  const opened = await decryptUserIdentityFromEncryptedBlob(vaultKey, blob.payload);
  assert.equal(opened.mldsa65Seed?.length, 32);

  const conflicting = await prepareMlDsaIdentityUpgrade({
    vaultKey,
    userId: "1000000000000000001",
    ed25519SecretKey: ed.secret,
    mlkem768DecapsulationKey: new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(9),
  });
  await assert.rejects(
    () =>
      service.upload({
        userId: "1000000000000000001",
        publicKeyBase64: Buffer.from(conflicting.publicKey).toString("base64"),
        encryptedPrivateKey: conflicting.encryptedPrivateKey,
        signatureBase64: Buffer.from(conflicting.signature).toString("base64"),
      }),
    (error: unknown) => error instanceof MldsaIdentityKeyError && error.statusCode === 409,
  );
});

test("identity key upload stores the public key and keeps v1 bundles readable", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `mldsa-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const ed = ed25519Pair();
  const user = await storage.repositories.users.create({
    email,
    publicKey: Buffer.from(ed.publicKey).toString("base64"),
    publicPqKey: Buffer.alloc(1184, 3).toString("base64"),
    encryptedPrivateKey: new Uint8Array([1, 2, 3]),
    serverKeyShare: new Uint8Array(32).fill(1),
    passwordKdfSalt: new Uint8Array(16).fill(2),
    passwordKdfParamsVersion: 2,
  });
  assert.equal(user.publicMldsaKey, null);

  const vaultKey = new Uint8Array(32).fill(12);
  const prepared = await prepareMlDsaIdentityUpgrade({
    vaultKey,
    userId: user.id,
    ed25519SecretKey: ed.secret,
    mlkem768DecapsulationKey: new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(9),
  });
  const service = new MldsaIdentityKeyService(storage.repositories.users);
  const stored = await service.upload({
    userId: user.id,
    publicKeyBase64: Buffer.from(prepared.publicKey).toString("base64"),
    encryptedPrivateKey: prepared.encryptedPrivateKey,
    signatureBase64: Buffer.from(prepared.signature).toString("base64"),
  });
  assert.equal(stored.status, "stored");

  const row = await storage.postgres.query<{ public_mldsa_key: string | null; encrypted_private_key: Buffer }>(
    "SELECT public_mldsa_key, encrypted_private_key FROM users WHERE id = $1",
    [user.id],
  );
  assert.equal(row[0]?.public_mldsa_key, stored.public_mldsa_key);
  const blob = JSON.parse(row[0]!.encrypted_private_key.toString("utf8")) as { payload: string };
  const opened = await decryptUserIdentityFromEncryptedBlob(vaultKey, blob.payload);
  assert.equal(opened.mldsa65Seed?.length, 32);
  assert.deepEqual(opened.ed25519SecretKey, ed.secret);

  const replay = await service.upload({
    userId: user.id,
    publicKeyBase64: stored.public_mldsa_key,
    encryptedPrivateKey: prepared.encryptedPrivateKey,
    signatureBase64: Buffer.from(prepared.signature).toString("base64"),
  });
  assert.equal(replay.status, "stored");

  const conflicting = await prepareMlDsaIdentityUpgrade({
    vaultKey,
    userId: user.id,
    ed25519SecretKey: ed.secret,
    mlkem768DecapsulationKey: new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(9),
  });
  await assert.rejects(
    () =>
      service.upload({
        userId: user.id,
        publicKeyBase64: Buffer.from(conflicting.publicKey).toString("base64"),
        encryptedPrivateKey: conflicting.encryptedPrivateKey,
        signatureBase64: Buffer.from(conflicting.signature).toString("base64"),
      }),
    (error: unknown) => error instanceof MldsaIdentityKeyError && error.statusCode === 409,
  );

  await assert.rejects(
    () =>
      service.upload({
        userId: user.id,
        publicKeyBase64: stored.public_mldsa_key,
        encryptedPrivateKey: prepared.encryptedPrivateKey,
        signatureBase64: Buffer.alloc(64, 1).toString("base64"),
      }),
    (error: unknown) => error instanceof MldsaIdentityKeyError && error.statusCode === 400,
  );
});

function flipBase64(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 0x01;
  return bytes.toString("base64");
}
