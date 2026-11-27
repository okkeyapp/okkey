import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBiometricUnlockAttemptGate,
  fallbackUnlockMode,
  resolveExtensionUnlockGate,
} from "./extensionPopupUnlock.ts";

test("resolveExtensionUnlockGate prefers biometrics only when enabled and wrap present", () => {
  assert.deepEqual(
    resolveExtensionUnlockGate({
      biometricEnabled: true,
      hasBioWrap: true,
      pinEnabled: true,
      hasPinWrap: true,
    }),
    { biometricAvailable: true, pinAvailable: true, initialMode: "biometric" },
  );
  assert.deepEqual(
    resolveExtensionUnlockGate({
      biometricEnabled: true,
      hasBioWrap: false,
      pinEnabled: true,
      hasPinWrap: true,
    }),
    { biometricAvailable: false, pinAvailable: true, initialMode: "pin" },
  );
  assert.deepEqual(
    resolveExtensionUnlockGate({
      biometricEnabled: false,
      hasBioWrap: true,
      pinEnabled: false,
      hasPinWrap: false,
    }),
    { biometricAvailable: false, pinAvailable: false, initialMode: "master" },
  );
  assert.deepEqual(
    resolveExtensionUnlockGate({
      biometricEnabled: false,
      hasBioWrap: false,
      pinEnabled: true,
      hasPinWrap: false,
    }),
    { biometricAvailable: false, pinAvailable: false, initialMode: "master" },
  );
});

test("fallbackUnlockMode keeps PIN when available", () => {
  assert.equal(fallbackUnlockMode(true), "pin");
  assert.equal(fallbackUnlockMode(false), "master");
});

test("createBiometricUnlockAttemptGate never calls unlock twice for one attempt", async () => {
  let calls = 0;
  const gate = createBiometricUnlockAttemptGate(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true as const, value: calls };
  });

  const [a, b, c] = await Promise.all([gate.runOnce(), gate.runOnce(), gate.runOnce()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { ok: true, value: 1 });
  assert.deepEqual(b, { ok: true, value: 1 });
  assert.deepEqual(c, { ok: true, value: 1 });

  const afterComplete = await gate.runOnce();
  assert.equal(afterComplete, null);
  assert.equal(calls, 1);
  assert.equal(gate.hasCompleted(), true);
});

test("createBiometricUnlockAttemptGate reset allows a fresh unlock after lock", async () => {
  let calls = 0;
  const gate = createBiometricUnlockAttemptGate(async () => {
    calls += 1;
    return { ok: false as const, code: "cancelled" as const };
  });
  assert.deepEqual(await gate.runOnce(), { ok: false, code: "cancelled" });
  assert.equal(await gate.runOnce(), null);
  gate.reset();
  assert.equal(gate.hasCompleted(), false);
  assert.deepEqual(await gate.runOnce(), { ok: false, code: "cancelled" });
  assert.equal(calls, 2);
});
