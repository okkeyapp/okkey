import assert from "node:assert/strict";
import test from "node:test";

import {
  canEnableTrustedDevicesRecovery,
  MIN_TRUSTED_CONTACTS_CONFIRMED,
  MIN_TRUSTED_DEVICES_FOR_RECOVERY,
  resolveAccountRecoveryEntitlements,
} from "../../../packages/types/dist/account-recovery-entitlements.js";

test("MIN_TRUSTED_CONTACTS_CONFIRMED is 3", () => {
  assert.equal(MIN_TRUSTED_CONTACTS_CONFIRMED, 3);
});

test("MIN_TRUSTED_DEVICES_FOR_RECOVERY is 2", () => {
  assert.equal(MIN_TRUSTED_DEVICES_FOR_RECOVERY, 2);
});

test("canEnableTrustedDevicesRecovery requires ≥2 trusted including current", () => {
  assert.equal(canEnableTrustedDevicesRecovery([]), false);
  assert.equal(
    canEnableTrustedDevicesRecovery([{ status: "trusted", is_current: true }]),
    false,
  );
  assert.equal(
    canEnableTrustedDevicesRecovery([
      { status: "trusted", is_current: true },
      { status: "pending_approval", is_current: false },
    ]),
    false,
  );
  assert.equal(
    canEnableTrustedDevicesRecovery([
      { status: "trusted", is_current: true },
      { status: "trusted", is_current: false },
    ]),
    true,
  );
});

test("resolveAccountRecoveryEntitlements: empty workspaces → key only", () => {
  const entitlements = resolveAccountRecoveryEntitlements([]);
  assert.deepEqual(entitlements, {
    recoveryKey: true,
    trustedDevices: false,
    trustedContacts: false,
  });
});

test("resolveAccountRecoveryEntitlements: FREE-only → key only", () => {
  const entitlements = resolveAccountRecoveryEntitlements([{ planTier: "FREE" }]);
  assert.equal(entitlements.recoveryKey, true);
  assert.equal(entitlements.trustedDevices, false);
  assert.equal(entitlements.trustedContacts, false);
});

test("resolveAccountRecoveryEntitlements: any PREMIUM+ membership unlocks devices+contacts", () => {
  const entitlements = resolveAccountRecoveryEntitlements([
    { planTier: "FREE" },
    { planTier: "TEAM" },
  ]);
  assert.equal(entitlements.recoveryKey, true);
  assert.equal(entitlements.trustedDevices, true);
  assert.equal(entitlements.trustedContacts, true);
});

test("resolveAccountRecoveryEntitlements: custom override can enable paid methods on FREE base", () => {
  const entitlements = resolveAccountRecoveryEntitlements([
    {
      planTier: "FREE",
      planCustomOverride: true,
      planFeatureOverrides: { accountRecovery: true, trustedContacts: true },
    },
  ]);
  assert.equal(entitlements.trustedDevices, true);
  assert.equal(entitlements.trustedContacts, true);
});

test("resolveAccountRecoveryEntitlements: custom override can disable paid methods on PREMIUM", () => {
  const entitlements = resolveAccountRecoveryEntitlements([
    {
      planTier: "PREMIUM",
      planCustomOverride: true,
      planFeatureOverrides: { accountRecovery: false, trustedContacts: false },
    },
  ]);
  assert.equal(entitlements.trustedDevices, false);
  assert.equal(entitlements.trustedContacts, false);
});
