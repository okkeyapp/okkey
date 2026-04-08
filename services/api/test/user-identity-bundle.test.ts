import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import { loadConfig } from "../src/config.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { SessionService } from "../src/session/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  buildRegistrationCryptoArtifacts,
  registrationArtifactsToWire,
} from "../../../packages/crypto/dist/registration.js";
import {
  decodeUserIdentityPrivateBundleV1,
  decryptUserIdentityFromEncryptedBlob,
  encodeUserIdentityPrivateBundleV1,
  encryptUserIdentityPrivateBundle,
  generateMlkem768KeypairMaterial,
  MLKEM768_DECAPSULATION_KEY_LEN,
  MLKEM768_ENCAPSULATION_KEY_LEN,
  userIdentityEncryptedBlobDtoFromPayload,
} from "../../../packages/crypto/dist/user-identity-bundle.js";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
} from "./two-factor-test-helpers.ts";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
let wasmInitialized = false;

function ensureWasmSync(): void {
  if (wasmInitialized) {
    return;
  }
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));
  wasmInitialized = true;
}

test("unit: user identity bundle encode/decode round-trip", () => {
  const ed25519Secret = new Uint8Array(32).fill(7);
  const mlkemDecapsulation = new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(9);

  const encoded = encodeUserIdentityPrivateBundleV1(ed25519Secret, mlkemDecapsulation);
  const decoded = decodeUserIdentityPrivateBundleV1(encoded);

  assert.deepEqual(decoded.ed25519SecretKey, ed25519Secret);
  assert.deepEqual(decoded.mlkem768DecapsulationKey, mlkemDecapsulation);
});

test("unit: user identity bundle decode validates payload length", () => {
  const malformed = new Uint8Array(64);
  assert.throws(() => decodeUserIdentityPrivateBundleV1(malformed));
});

test("unit: user identity bundle decrypt from EncryptedBlob payload", async () => {
  ensureWasmSync();
  const vaultKey = new Uint8Array(32).fill(21);
  const ed25519Secret = new Uint8Array(32).fill(3);
  const mlkemDecapsulation = new Uint8Array(MLKEM768_DECAPSULATION_KEY_LEN).fill(4);
  const plaintextBundle = encodeUserIdentityPrivateBundleV1(ed25519Secret, mlkemDecapsulation);
  const encryptedPayload = await encryptUserIdentityPrivateBundle(vaultKey, plaintextBundle);
  const blob = userIdentityEncryptedBlobDtoFromPayload(encryptedPayload);

  const decrypted = await decryptUserIdentityFromEncryptedBlob(vaultKey, blob.payload);
  assert.deepEqual(decrypted.ed25519SecretKey, ed25519Secret);
  assert.deepEqual(decrypted.mlkem768DecapsulationKey, mlkemDecapsulation);
});

test("unit: ML-KEM-768 keypair generator returns fixed lengths", async () => {
  ensureWasmSync();
  const pair = await generateMlkem768KeypairMaterial();
  assert.equal(pair.decapsulationKey.length, MLKEM768_DECAPSULATION_KEY_LEN);
  assert.equal(pair.encapsulationKey.length, MLKEM768_ENCAPSULATION_KEY_LEN);
});

test("integration: registration + first unlock decrypts stored hybrid identity bundle", async (t) => {
  ensureWasmSync();
  const config = loadConfig();
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);

  const suffix = randomUUID();
  const email = `reg-unlock-${suffix}@okkey.local`;
  const authStateId = randomUUID();

  t.after(async () => {
    try {
      await storage.redis.del(authStateRedisKey(authStateId));
      await storage.redis.del(`registration:result:${authStateId}`);
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const emailTemplates = new EmailTemplateService({ send: async () => {} }, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });

  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });

  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    sessionService,
    config,
  });

  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );

  const artifacts = await buildRegistrationCryptoArtifacts(
    new TextEncoder().encode("MasterPassword!123"),
  );
  const wire = registrationArtifactsToWire(artifacts);

  const result = await registrationService.completeRegistration({
    authStateId,
    userPublicKey: wire.user_public_key,
    userPublicPqKey: wire.user_public_pq_key,
    encryptedPrivateKey: wire.encrypted_private_key,
    serverKeyShare: artifacts.serverKeyShare,
    passwordKdfSalt: artifacts.passwordKdfSalt,
    passwordKdfParamsVersion: artifacts.passwordKdfParamsVersion,
    deviceFingerprint: "e".repeat(64),
    deviceName: "Unlock test device",
    devicePublicKey: Buffer.from("unlock-test-device-pk").toString("base64"),
    deviceShare: artifacts.deviceShare,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
  });

  assert.equal(result.deviceStatus, "trusted");

  const rows = await storage.postgres.query<{
    public_pq_key: string | null;
    encrypted_private_key: Buffer;
  }>(
    "SELECT public_pq_key, encrypted_private_key FROM users WHERE id = $1",
    [result.userId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].public_pq_key, wire.user_public_pq_key);

  const storedBlob = JSON.parse(rows[0].encrypted_private_key.toString("utf8")) as {
    payload: string;
  };
  const unlocked = await decryptUserIdentityFromEncryptedBlob(artifacts.vaultKey, storedBlob.payload);
  assert.equal(unlocked.ed25519SecretKey.length, 32);
  assert.equal(unlocked.mlkem768DecapsulationKey.length, MLKEM768_DECAPSULATION_KEY_LEN);
});
