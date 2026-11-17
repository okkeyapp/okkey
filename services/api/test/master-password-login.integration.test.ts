import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";

import { AuthService } from "../src/auth/service.ts";
import { createLoginVerifier } from "../src/crypto/login-verifier.ts";
import { DeviceService } from "../src/device/service.ts";
import { loadConfig } from "../src/config.ts";
import { SessionService } from "../src/session/service.ts";
import { TwoFactorService } from "../src/two-factor/service.ts";
import { createIntegrationStorage } from "./integration-env.ts";
import { hybridDeviceShareB64 } from "./hybrid-share-fixture.ts";
import { testEntityId } from "./test-entity-id.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  registerUser,
} from "./two-factor-test-helpers.ts";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));
const { deriveLoginKey } = await import("../../../packages/crypto/dist/index.js");

test("integration: login key enrolls, device approval still applies, TOTP is required", async (t) => {
  const config = loadConfig();
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return;
  }
  await applyMigrations(storage);
  const email = `login-key-${testEntityId()}@okkey.local`;
  const password = new TextEncoder().encode("integration-master-password");
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const loginKey = await deriveLoginKey({ masterPasswordUtf8: password, email });
  const material = createLoginVerifier(loginKey);
  assert.equal(
    await storage.repositories.users.setLoginVerifier(userId, material),
    true,
  );
  const stored = await storage.repositories.users.findLoginVerifierByEmail(email);
  assert.ok(stored?.verifier);
  assert.notDeepEqual(Buffer.from(stored.verifier), Buffer.from(loginKey));
  assert.equal(Buffer.from(stored.verifier).toString("utf8").includes("integration-master"), false);

  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates: { sendAuthEmailCode: async () => {} },
    config,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
  });
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    log: createLoggerStub(),
  });

  const proved = await authService.loginWithMasterPasswordProof({
    email,
    loginKey,
    requestIp: "198.51.100.10",
  });
  assert.equal(proved.nextStep, "device_check");
  assert.equal("accessToken" in proved, false);

  const session = await twoFactor.bootstrapSessionAfterEmail({ authStateId: proved.authStateId });
  assert.equal(session.userId, userId);
  const unbound = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM sessions WHERE user_id = $1 AND device_id IS NULL",
    [userId],
  );
  assert.ok(unbound.length >= 1);

  const registered = await deviceService.registerDevice(userId, "198.51.100.10", {
    deviceFingerprint: "c".repeat(64),
    devicePublicKey: Buffer.from("login-key-second-device").toString("base64"),
    deviceShare: hybridDeviceShareB64(4),
    deviceName: "Second browser",
    platform: "desktop",
    osName: "Linux",
    osVersion: "6",
    appVersion: "1.0.0",
    clientType: "web",
    userAgent: "test",
  });
  assert.equal(registered.status, "pending_approval");

  await storage.postgres.query(
    "UPDATE users SET two_factor_enabled_at = now() WHERE id = $1",
    [userId],
  );
  const withTotp = await authService.loginWithMasterPasswordProof({
    email,
    loginKey,
    requestIp: "198.51.100.11",
  });
  assert.equal(withTotp.nextStep, "two_factor");
  await assert.rejects(
    () => twoFactor.bootstrapSessionAfterEmail({ authStateId: withTotp.authStateId }),
    (error: { code?: string }) => error.code === "TWO_FACTOR_REQUIRED",
  );
});
