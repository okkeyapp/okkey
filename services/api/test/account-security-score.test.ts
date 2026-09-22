import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_SECURITY_FACTOR_WEIGHTS,
  computeAccountSecurityScore,
  type AccountSecurityScoreInput,
} from "../../../packages/types/src/account-security-score.ts";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

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
    devices: { trustedCount: 0, pendingCount: 0 },
    loginMethods: { available: false, hasPasskeyOrHardware: false },
    ...overrides,
  };
}

test("empty FREE account scores 0 and recommends 2FA first", () => {
  const result = computeAccountSecurityScore(baseInput());
  assert.equal(result.score, 0);
  assert.equal(result.colorBand, "critical");
  assert.equal(result.recommendations[0]?.id, "enableTwoFactor");
  assert.ok(!result.includedFactors.includes("trustedDevicesRecovery"));
  assert.ok(!result.includedFactors.includes("trustedContacts"));
  assert.ok(!result.includedFactors.includes("loginMethods"));
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
      devices: { trustedCount: 1, pendingCount: 0 },
    }),
  );
  const expectedMax =
    ACCOUNT_SECURITY_FACTOR_WEIGHTS.twoFactorEnabled +
    ACCOUNT_SECURITY_FACTOR_WEIGHTS.backupCodes +
    ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyEnrolled +
    ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyExported +
    ACCOUNT_SECURITY_FACTOR_WEIGHTS.trustedDevicesPresent;
  assert.equal(result.availableMax, expectedMax);
  assert.equal(result.rawPoints, expectedMax);
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
  assert.ok(!result.recommendations.some((r) => r.id === "enableTwoFactor"));
});

test("factor D: enrolled without export awards partial 5", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      recovery: {
        entitlements: { trustedDevices: false, trustedContacts: false },
        settings: { keyEnabled: true, devicesEnabled: false, contactsEnabled: false },
        key: { enrolled: true, exportedAt: null },
        confirmedContactCount: 0,
        minConfirmedContacts: 3,
      },
    }),
  );
  assert.equal(result.factorPoints.recoveryKeyEnrolled, 15);
  assert.equal(result.factorPoints.recoveryKeyExported, 5);
});

test("paid E/F included when entitled; incomplete earns 0", () => {
  const result = computeAccountSecurityScore(
    baseInput({
      recovery: {
        entitlements: { trustedDevices: true, trustedContacts: true },
        settings: { keyEnabled: false, devicesEnabled: true, contactsEnabled: false },
        key: { enrolled: false, exportedAt: null },
        confirmedContactCount: 1,
        minConfirmedContacts: 3,
      },
      devices: { trustedCount: 0, pendingCount: 1 },
    }),
  );
  assert.ok(result.includedFactors.includes("trustedDevicesRecovery"));
  assert.ok(result.includedFactors.includes("trustedContacts"));
  assert.equal(result.factorPoints.trustedDevicesRecovery, 0);
  assert.equal(result.factorPoints.trustedContacts, 0);
  assert.ok(result.recommendations.some((r) => r.id === "addTrustedDevice"));
  assert.ok(result.recommendations.some((r) => r.id === "confirmTrustedContacts"));
});

test("color bands follow approved thresholds", () => {
  // Force score via known fraction: only A available in a stripped set —
  // use full FREE set with only 2FA on → 25/70 ≈ 36 → weak
  const only2fa = computeAccountSecurityScore(
    baseInput({
      twoFactor: {
        enabled: true,
        backupCodesRemaining: 0,
        backupCodesGeneratedAt: null,
        backupCodesExportedAt: null,
      },
    }),
  );
  assert.equal(only2fa.score, Math.round((25 / 70) * 100));
  assert.equal(only2fa.colorBand, "weak");
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
      devices: { trustedCount: 1, pendingCount: 0 },
      loginMethods: { available: true, hasPasskeyOrHardware: false },
    }),
  );
  assert.ok(without.includedFactors.includes("loginMethods"));
  assert.equal(without.score, Math.round((70 / 75) * 100));
  assert.ok(without.recommendations.some((r) => r.id === "addLoginMethod"));
});
