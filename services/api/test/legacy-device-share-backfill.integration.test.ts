import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { initSync } from "@okkey/crypto-wasm";

const testDir = path.dirname(fileURLToPath(import.meta.url));
initSync(readFileSync(path.join(testDir, "../../../packages/crypto/dist/okkey_crypto_engine_bg.wasm")));

const {
  buildRegistrationCryptoArtifacts,
  classifySplitKeyShareBWire,
  decryptUserIdentityFromEncryptedBlob,
  openStoredSplitKeyShareB,
  reconstructVaultKeyWithMasterPassword,
  userIdentityEncryptedBlobDtoFromPayload,
  wipeBytes,
  wrapSplitKeyShareB,
} = await import("@okkey/crypto");
import { AuthService } from "../src/auth/service.ts";
import { VaultUnlockBootstrapService } from "../src/account/vault-unlock-bootstrap.ts";
import { DeviceService } from "../src/device/service.ts";
import { backfillLegacyDeviceShares } from "../src/device/legacy-device-share-backfill.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { authStateRedisKey } from "../src/auth/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { SessionService } from "../src/session/service.ts";
import { loadConfig } from "../src/config.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { hybridDeviceShareBytes } from "./hybrid-share-fixture.ts";
import { testEntityId } from "./test-entity-id.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
} from "./two-factor-test-helpers.ts";

const migrationSql = readFileSync(
  path.resolve(testDir, "../migrations/0052_clear_inactive_device_shares.sql"),
  "utf8",
);

test("integration: device share migration clears inactive rows and backfill removes raw shares", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);

  const password = "correct horse battery";
  const passwordBytes = new TextEncoder().encode(password);
  const rewrapMaterial = await buildRegistrationCryptoArtifacts(passwordBytes);
  const nullMaterial = await buildRegistrationCryptoArtifacts(passwordBytes);
  const rewrapEmail = `share-rewrap-${testEntityId()}@okkey.local`;
  const nullEmail = `share-null-${testEntityId()}@okkey.local`;

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
    generateCode: () => "123456",
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
  const devices = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    log: createLoggerStub(),
  });
  const bootstrap = new VaultUnlockBootstrapService({
    users: storage.repositories.users,
    devices: storage.repositories.devices,
  });

  t.after(async () => {
    wipeBytes(passwordBytes);
    wipeBytes(rewrapMaterial.deviceShare);
    wipeBytes(rewrapMaterial.vaultKey);
    wipeBytes(rewrapMaterial.shareWrap.ed25519Seed);
    wipeBytes(rewrapMaterial.shareWrap.mlkemDecapsulationKey);
    wipeBytes(nullMaterial.deviceShare);
    wipeBytes(nullMaterial.vaultKey);
    wipeBytes(nullMaterial.shareWrap.ed25519Seed);
    wipeBytes(nullMaterial.shareWrap.mlkemDecapsulationKey);
    try {
      await cleanupUserData(storage, rewrapEmail);
      await cleanupUserData(storage, nullEmail);
    } finally {
      await storage.close();
    }
  });

  const rewrapUser = await registerWithMaterial(registrationService, storage, rewrapEmail, rewrapMaterial);
  const nullUser = await registerWithMaterial(registrationService, storage, nullEmail, nullMaterial);
  const rewrapDeviceId = await trustedDeviceId(storage, rewrapUser.userId);
  const nullDeviceId = await trustedDeviceId(storage, nullUser.userId);
  assert.ok(rewrapDeviceId);
  assert.ok(nullDeviceId);

  await storage.postgres.query(
    "UPDATE devices SET device_share = $2 WHERE id = $1::bigint",
    [rewrapDeviceId, Buffer.from(rewrapMaterial.deviceShare)],
  );
  await storage.postgres.query(
    "UPDATE devices SET device_share = $2 WHERE id = $1::bigint",
    [nullDeviceId, Buffer.from(nullMaterial.deviceShare)],
  );

  const hybridKeeper = await insertDevice(storage, {
    userId: rewrapUser.userId,
    fingerprint: "c".repeat(64),
    publicKey: "hybrid-keeper",
    share: Buffer.from(hybridDeviceShareBytes(4)),
    status: "trusted",
    createdAt: new Date(),
  });
  const revokedId = await insertDevice(storage, {
    userId: rewrapUser.userId,
    fingerprint: "d".repeat(64),
    publicKey: "revoked-device",
    share: Buffer.alloc(32, 1),
    status: "revoked",
    createdAt: new Date(),
    revokedAt: new Date(),
  });
  const rejectedId = await insertDevice(storage, {
    userId: rewrapUser.userId,
    fingerprint: "e".repeat(64),
    publicKey: "rejected-device",
    share: Buffer.alloc(32, 2),
    status: "revoked",
    createdAt: new Date(),
    rejectedAt: new Date(),
  });
  const expiredId = await insertDevice(storage, {
    userId: rewrapUser.userId,
    fingerprint: "1".repeat(64),
    publicKey: "expired-device",
    share: Buffer.alloc(32, 3),
    status: "pending",
    createdAt: new Date(Date.now() - (config.deviceApprovalTtlSeconds + 60) * 1000),
  });

  await storage.postgres.query(migrationSql);
  assert.equal(await shareLength(storage, revokedId), null);
  assert.equal(await shareLength(storage, rejectedId), null);
  assert.equal(await shareLength(storage, expiredId), 32);
  assert.equal(await shareLength(storage, rewrapDeviceId), 32);
  assert.equal(await shareLength(storage, nullDeviceId), 32);
  assert.ok((await shareLength(storage, hybridKeeper))! > 32);

  const first = await backfillLegacyDeviceShares(storage.postgres, {
    approvalTtlMs: config.deviceApprovalTtlSeconds * 1000,
    resolveWrapKeys: (row) =>
      row.id === rewrapDeviceId
        ? {
            ed25519PublicKey: rewrapMaterial.shareWrap.ed25519PublicKey,
            mlkemEncapsulationKey: rewrapMaterial.shareWrap.mlkemEncapsulationKey,
          }
        : null,
    userIds: [rewrapUser.userId, nullUser.userId],
  });
  assert.equal(first.rewrapped, 1);
  assert.equal(first.cleared, 2);

  assert.equal(await shareLength(storage, expiredId), null);
  assert.equal(await shareLength(storage, nullDeviceId), null);
  assert.equal(await shareLength(storage, revokedId), null);
  assert.equal(await shareLength(storage, rejectedId), null);
  const keeperLength = await shareLength(storage, hybridKeeper);
  assert.equal(classifyStored(await shareBytes(storage, hybridKeeper)), "hybrid");
  const rewrapped = await shareBytes(storage, rewrapDeviceId);
  assert.ok(rewrapped);
  assert.equal(classifySplitKeyShareBWire(rewrapped), "hybrid");
  assert.equal(await countRawShares(storage, [rewrapUser.userId, nullUser.userId]), 0);

  const second = await backfillLegacyDeviceShares(storage.postgres, {
    approvalTtlMs: config.deviceApprovalTtlSeconds * 1000,
    resolveWrapKeys: () => {
      throw new Error("second pass must not read wrap keys");
    },
    userIds: [rewrapUser.userId, nullUser.userId],
  });
  assert.deepEqual(second, {
    rewrapped: 0,
    cleared: 0,
    unchanged: 2,
  });
  assert.equal(await shareLength(storage, hybridKeeper), keeperLength);

  const openedRewrap = await openStoredSplitKeyShareB({
    stored: rewrapped,
    recipientEd25519Seed: rewrapMaterial.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: rewrapMaterial.shareWrap.mlkemDecapsulationKey,
  });
  assert.deepEqual(openedRewrap, rewrapMaterial.deviceShare);
  await unlockFromBootstrap(bootstrap, rewrapUser.userId, rewrapDeviceId, passwordBytes, openedRewrap, rewrapMaterial);

  const loginStart = await authService.startEmailLogin({
    email: nullEmail,
    requestIp: "127.0.0.1",
  });
  const confirmed = await authService.confirmEmailCode({
    challengeId: loginStart.challengeId,
    code: "123456",
    requestIp: "127.0.0.1",
  });
  assert.equal(confirmed.userExists, true);
  const session = await sessionService.createSession(nullUser.userId, { deviceId: nullDeviceId });
  assert.ok(session.accessToken.length > 8);

  const cleared = await bootstrap.getForBoundDevice({
    userId: nullUser.userId,
    deviceId: nullDeviceId,
  });
  assert.equal(cleared.device_share, "");
  assert.equal(cleared.server_key_share.length > 0, true);
  await unlockFromBootstrap(
    bootstrap,
    nullUser.userId,
    nullDeviceId,
    passwordBytes,
    nullMaterial.deviceShare,
    nullMaterial,
  );

  const restored = await wrapSplitKeyShareB({
    share: nullMaterial.deviceShare,
    recipientEd25519PublicKey: nullMaterial.shareWrap.ed25519PublicKey,
    recipientMlkemEncapsulationKey: nullMaterial.shareWrap.mlkemEncapsulationKey,
  });
  const uploaded = await devices.registerDevice(nullUser.userId, "127.0.0.1", {
    deviceFingerprint: "f".repeat(64),
    devicePublicKey: Buffer.from("null-device-pk").toString("base64"),
    deviceShare: Buffer.from(restored).toString("base64"),
    deviceName: "Restored",
    platform: "desktop",
    osName: "macOS",
    osVersion: "14",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
  });
  assert.equal(uploaded.status, "trusted");
  assert.equal(uploaded.deviceId, nullDeviceId);
  const afterUpload = await shareBytes(storage, nullDeviceId);
  assert.ok(afterUpload);
  assert.equal(classifySplitKeyShareBWire(afterUpload), "hybrid");
  const openedUpload = await openStoredSplitKeyShareB({
    stored: afterUpload,
    recipientEd25519Seed: nullMaterial.shareWrap.ed25519Seed,
    recipientMlkemDecapsulationKey: nullMaterial.shareWrap.mlkemDecapsulationKey,
  });
  await unlockFromBootstrap(
    bootstrap,
    nullUser.userId,
    nullDeviceId,
    passwordBytes,
    openedUpload,
    nullMaterial,
  );

  const again = await devices.registerDevice(nullUser.userId, "127.0.0.1", {
    deviceFingerprint: "f".repeat(64),
    devicePublicKey: Buffer.from("null-device-pk").toString("base64"),
    deviceShare: Buffer.from(hybridDeviceShareBytes(9)).toString("base64"),
    deviceName: "Restored",
    platform: "desktop",
    osName: "macOS",
    osVersion: "14",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
  });
  assert.equal(again.deviceId, nullDeviceId);
  assert.deepEqual(await shareBytes(storage, nullDeviceId), afterUpload);
  wipeBytes(openedRewrap);
  wipeBytes(openedUpload);
  wipeBytes(restored);
});

async function unlockFromBootstrap(
  bootstrap: VaultUnlockBootstrapService,
  userId: string,
  deviceId: string,
  passwordBytes: Uint8Array,
  deviceShare: Uint8Array,
  material: Awaited<ReturnType<typeof buildRegistrationCryptoArtifacts>>,
): Promise<void> {
  const wire = await bootstrap.getForBoundDevice({ userId, deviceId });
  const vaultKey = await reconstructVaultKeyWithMasterPassword({
    masterPasswordUtf8: passwordBytes,
    serverKeyShare: Buffer.from(wire.server_key_share, "base64"),
    deviceShare,
    passwordKdfSalt: Buffer.from(wire.password_kdf_salt, "base64"),
    passwordKdfParamsVersion: wire.password_kdf_params_version,
  });
  try {
    await decryptUserIdentityFromEncryptedBlob(vaultKey, wire.encrypted_private_key.payload);
  } finally {
    wipeBytes(vaultKey);
  }
  assert.equal(wire.password_kdf_salt, Buffer.from(material.passwordKdfSalt).toString("base64"));
}

async function registerWithMaterial(
  registrationService: RegistrationService,
  storage: Awaited<ReturnType<typeof createIntegrationStorage>>,
  email: string,
  material: Awaited<ReturnType<typeof buildRegistrationCryptoArtifacts>>,
): Promise<{ userId: string }> {
  if (!storage) {
    throw new Error("storage required");
  }
  const authStateId = testEntityId();
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
  const result = await registrationService.completeRegistration({
    authStateId,
    userPublicKey: Buffer.from(material.userPublicKey).toString("base64"),
    userPublicPqKey: Buffer.from(material.userPublicPqKey).toString("base64"),
    userPublicMldsaKey: Buffer.from(material.userPublicMlDsaKey).toString("base64"),
    encryptedPrivateKey: userIdentityEncryptedBlobDtoFromPayload(material.encryptedPrivateKey),
    serverKeyShare: material.serverKeyShare,
    passwordKdfSalt: material.passwordKdfSalt,
    passwordKdfParamsVersion: material.passwordKdfParamsVersion,
    deviceFingerprint: "f".repeat(64),
    deviceName: "Upgrade device",
    devicePublicKey: Buffer.from("null-device-pk").toString("base64"),
    deviceShare: material.wrappedDeviceShare,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
    deviceCryptoCapable: true,
  });
  return { userId: result.userId };
}

async function trustedDeviceId(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  userId: string,
): Promise<string | undefined> {
  const rows = await storage.postgres.query<{ id: string }>(
    "SELECT id::text AS id FROM devices WHERE user_id = $1::bigint AND status = 'trusted' LIMIT 1",
    [userId],
  );
  return rows[0]?.id;
}

async function insertDevice(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  input: {
    userId: string;
    fingerprint: string;
    publicKey: string;
    share: Buffer;
    status: "trusted" | "pending" | "revoked";
    createdAt: Date;
    rejectedAt?: Date;
    revokedAt?: Date;
  },
): Promise<string> {
  const id = testEntityId();
  await storage.postgres.query(
    `
      INSERT INTO devices (
        id, user_id, device_fingerprint, device_name, device_public_key, device_share,
        platform, os_name, os_version, app_version, client_type, user_agent,
        ip_first, ip_last, status, created_at, rejected_at, revoked_at
      ) VALUES (
        $1::bigint, $2::bigint, $3, 'Extra', $4, $5,
        'desktop', 'macOS', '14', '1.0.0', 'desktop', 'test',
        '127.0.0.1', '127.0.0.1', $6, $7::timestamptz, $8::timestamptz, $9::timestamptz
      )
    `,
    [
      id,
      input.userId,
      input.fingerprint,
      Buffer.from(input.publicKey).toString("base64"),
      input.share,
      input.status,
      input.createdAt.toISOString(),
      input.rejectedAt?.toISOString() ?? null,
      input.revokedAt?.toISOString() ?? null,
    ],
  );
  return id;
}

async function shareLength(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  deviceId: string,
): Promise<number | null> {
  const rows = await storage.postgres.query<{ len: number | null }>(
    "SELECT octet_length(device_share)::int AS len FROM devices WHERE id = $1::bigint",
    [deviceId],
  );
  return rows[0]?.len ?? null;
}

async function shareBytes(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  deviceId: string,
): Promise<Uint8Array | null> {
  const rows = await storage.postgres.query<{ device_share: Buffer | null }>(
    "SELECT device_share FROM devices WHERE id = $1::bigint",
    [deviceId],
  );
  const share = rows[0]?.device_share;
  return share ? Uint8Array.from(share) : null;
}

function classifyStored(bytes: Uint8Array | null): string | null {
  return bytes ? classifySplitKeyShareBWire(bytes) : null;
}

async function countRawShares(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  userIds: string[],
): Promise<number> {
  const rows = await storage.postgres.query<{ n: string }>(
    `
      SELECT COUNT(*)::text AS n
      FROM devices
      WHERE user_id = ANY($1::bigint[])
        AND device_share IS NOT NULL
        AND octet_length(device_share) = 32
    `,
    [userIds],
  );
  return Number(rows[0]?.n ?? 0);
}
