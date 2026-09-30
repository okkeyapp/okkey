import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_SECURITY_FACTOR_WEIGHTS,
  ACCOUNT_SECURITY_MAX_RECOMMENDATIONS,
  computeAccountSecurityScore,
  type AccountSecurityScoreInput,
} from "../../../packages/types/src/account-security-score.ts";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function vaultOk(
  overrides: Partial<AccountSecurityScoreInput["vault"]> = {},
): AccountSecurityScoreInput["vault"] {
  return {
    idleLockSeconds: 900,
    lockOnDeviceSleep: true,
    clipboardClearSeconds: 60,
    masterPasswordChangedAt: "2026-03-01T00:00:00.000Z",
    requireReauthOnDeletion: true,
    biometricEnabled: true,
    pinEnabled: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<AccountSecurityScoreInput> = {}): AccountSecurityScoreInput {
  return {
    nowMs: NOW,
    twoFactor: {
      enabled: false,
      backupCodesRemaining: 0,
      backupCodesGeneratedAt: null,
      backupCodesExportedAt: null,
    },
    recovery: {
      entitlements: { trustedDevices: false, trustedContacts: false },
      settings: { keyEnabled: false, devicesEnabled: false, contactsEnabled: false },
      key: { enrolled: false, exportedAt: null },
      confirmedContactCount: 0,
      minConfirmedContacts: 3,
    },
    devices: { pendingCount: 0 },
    vault: vaultOk(),
    loginMethods: { available: false, hasPasskeyOrHardware: false },
    ...overrides,
  };
}

const FREE_BASE_MAX =
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.twoFactorEnabled +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.backupCodes +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyEnrolled +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyExported +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultIdleLock +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultLockOnSleep +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultClipboardClear +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultMasterPasswordFresh +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultReauthOnDeletion +
  ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultBiometricOrPin;

test("empty FREE account scores 0-ish and recommends 2FA first (top by weight)", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      vault: vaultOk({
        idleLockSeconds: 3600,
        lockOnDeviceSleep: false,
        clipboardClearSeconds: 0,
        masterPasswordChangedAt: null,
        requireReauthOnDeletion: false,
        biometricEnabled: false,
        pinEnabled: false,
      }),
    }),
  );
  assert.equal(result.score, 0);
  assert.equal(result.colorBand, "critical");
  assert.equal(result.recommendations[0]?.id, "enableTwoFactor");
  assert.ok(result.recommendations.length <= ACCOUNT_SECURITY_MAX_RECOMMENDATIONS);
  assert.ok(!result.includedFactors.includes("trustedDevicesRecovery"));
  assert.ok(!result.includedFactors.includes("trustedContacts"));
  assert.ok(!Object.hasOwn(result.factorPoints, "trustedDevicesPresent"));
});

test("FREE renormalization: 100 reachable without paid E/F", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 8,
        backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
        backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
      },
      recovery: {
        entitlements: { trustedDevices: false, trustedContacts: false },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
        key: { enrolled: true, exportedAt: "2026-09-10T00:00:00.000Z" },
        confirmedContactCount: 0,
        minConfirmedContacts: 3,
      },
    }),
  );
  assert.equal(result.availableMax, FREE_BASE_MAX);
  assert.equal(result.rawPoints, FREE_BASE_MAX);
  assert.equal(result.score, 100);
  assert.equal(result.colorBand, "good");
  assert.equal(result.recommendations.length, 0);
});

test("factor B: without exportedAt is 0 even if codes remain", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 10,
        backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
        backupCodesExportedAt: null,
      },
    }),
  );
  assert.equal(result.factorPoints.backupCodes, 0);
  assert.equal(result.factorPoints.twoFactorEnabled, 25);
  assert.ok(result.recommendations.some((r) => r.id === "downloadBackupCodes"));
});

test("paid E included when entitled; device count is not scored", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      recovery: {
        entitlements: { trustedDevices: true, trustedContacts: true },
        settings: { keyEnabled: false, devicesEnabled: true, contactsEnabled: false },
        key: { enrolled: false, exportedAt: null },
        confirmedContactCount: 1,
        minConfirmedContacts: 3,
      },
      devices: { pendingCount: 1 },
    }),
  );
  assert.ok(result.includedFactors.includes("trustedDevicesRecovery"));
  assert.equal(result.factorPoints.trustedDevicesRecovery, 15);
  assert.ok(result.recommendations.some((r) => r.id === "confirmPendingDevices"));
  assert.ok(result.recommendations.some((r) => r.id === "confirmTrustedContacts"));
  assert.ok(!result.recommendations.some((r) => (r.id as string) === "addTrustedDevice"));
});

test("vault factors: thresholds for idle / clipboard / MP age / deletion / bio|pin", () => {
  const bad = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 8,
        backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
        backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
      },
      recovery: {
        entitlements: { trustedDevices: false, trustedContacts: false },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
        key: { enrolled: true, exportedAt: "2026-09-10T00:00:00.000Z" },
        confirmedContactCount: 0,
        minConfirmedContacts: 3,
      },
      vault: vaultOk({
        idleLockSeconds: 1800,
        lockOnDeviceSleep: false,
        clipboardClearSeconds: 120,
        masterPasswordChangedAt: "2024-01-01T00:00:00.000Z",
        requireReauthOnDeletion: false,
        biometricEnabled: false,
        pinEnabled: false,
      }),
    }),
  );
  assert.equal(bad.factorPoints.vaultIdleLock, 0);
  assert.equal(bad.factorPoints.vaultLockOnSleep, 0);
  assert.equal(bad.factorPoints.vaultClipboardClear, 0);
  assert.equal(bad.factorPoints.vaultMasterPasswordFresh, 0);
  assert.equal(bad.factorPoints.vaultReauthOnDeletion, 0);
  assert.equal(bad.factorPoints.vaultBiometricOrPin, 0);
  // Six vault gaps (weight 5 each) → only top 4 CTAs shown; score still reflects all zeros.
  assert.equal(bad.recommendations.length, ACCOUNT_SECURITY_MAX_RECOMMENDATIONS);
  assert.ok(
    bad.recommendations.every(
      (r) => r.target === "vault" || r.target === "deviceSecurity" || r.target === "deviceUnlock",
    ),
  );
  assert.ok(bad.score < 100);

  const clipboardNever = computeAccountSecurityScore(
    baseInput({
      vault: vaultOk({ clipboardClearSeconds: 0 }),
    }),
  );
  assert.equal(clipboardNever.factorPoints.vaultClipboardClear, 0);

  const pinOnly = computeAccountSecurityScore(
    baseInput({
      vault: vaultOk({ biometricEnabled: false, pinEnabled: true }),
    }),
  );
  assert.equal(pinOnly.factorPoints.vaultBiometricOrPin, 5);
});

test("recommendations capped at 4 and sorted by factor weight", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      vault: vaultOk({
        idleLockSeconds: 3600,
        lockOnDeviceSleep: false,
        clipboardClearSeconds: 0,
        masterPasswordChangedAt: null,
        requireReauthOnDeletion: false,
        biometricEnabled: false,
        pinEnabled: false,
      }),
    }),
  );
  assert.equal(result.recommendations.length, ACCOUNT_SECURITY_MAX_RECOMMENDATIONS);
  assert.equal(result.recommendations[0]?.id, "enableTwoFactor");
  // Next highest after 2FA among always-on gaps: recovery key enroll (15)
  assert.equal(result.recommendations[1]?.id, "enrollRecoveryKey");
  for (let i = 1; i < result.recommendations.length; i++) {
    assert.ok(result.recommendations[i - 1]!.priority >= result.recommendations[i]!.priority);
  }
});

test("color bands follow approved thresholds", () => {
  // Only 2FA on among FREE factors that award points: 25 / FREE_BASE_MAX
  const only2fa = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 0,
        backupCodesGeneratedAt: null,
        backupCodesExportedAt: null,
      },
      vault: vaultOk({
        idleLockSeconds: 3600,
        lockOnDeviceSleep: false,
        clipboardClearSeconds: 0,
        masterPasswordChangedAt: null,
        requireReauthOnDeletion: false,
        biometricEnabled: false,
        pinEnabled: false,
      }),
    }),
  );
  assert.equal(only2fa.score, Math.round((25 / FREE_BASE_MAX) * 100));
});

test("login methods factor renormalized when available", () => {
  const without = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 8,
        backupCodesGeneratedAt: "2026-09-01T00:00:00.000Z",
        backupCodesExportedAt: "2026-09-01T00:00:00.000Z",
      },
      recovery: {
        entitlements: { trustedDevices: false, trustedContacts: false },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
        key: { enrolled: true, exportedAt: "2026-09-10T00:00:00.000Z" },
        confirmedContactCount: 0,
        minConfirmedContacts: 3,
      },
      loginMethods: { available: true, hasPasskeyOrHardware: false },
    }),
  );
  assert.ok(without.includedFactors.includes("loginMethods"));
  assert.equal(
    without.score,
    Math.round((FREE_BASE_MAX / (FREE_BASE_MAX + ACCOUNT_SECURITY_FACTOR_WEIGHTS.loginMethods)) * 100),
  );
  assert.ok(without.recommendations.some((r) => r.id === "addLoginMethod"));
});
