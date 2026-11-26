import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import {
  clearPinFailures,
  getPinLockRemainingMs,
  isPinLocked,
  PIN_LENGTH,
  recordPinFailure,
} from "./pinRateLimit.ts";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const EN_LOCALE = new URL("../../../../packages/i18n/src/locales/web/en.json", import.meta.url);

function englishCopy(): Record<string, string> {
  return JSON.parse(readFileSync(EN_LOCALE, "utf8")) as Record<string, string>;
}

test("PIN length contract is 6 digits (QA extension 02)", () => {
  assert.equal(PIN_LENGTH, 6);
});

test("each wrong PIN is counted and the 5th within 5 minutes locks for 5 minutes (QA extension 02 §2.6)", () => {
  const userId = "pin-lockout-user";
  mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  try {
    clearPinFailures(userId);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = recordPinFailure(userId);
      assert.equal(result.locked, false, `attempt ${attempt} must not lock yet`);
      assert.equal(isPinLocked(userId), false);
    }
    const locked = recordPinFailure(userId);
    assert.equal(locked.locked, true);
    assert.equal(locked.remainingMs, FIVE_MINUTES_MS);
    assert.equal(isPinLocked(userId), true);
    assert.equal(getPinLockRemainingMs(userId), FIVE_MINUTES_MS);

    const still = recordPinFailure(userId);
    assert.equal(still.locked, true);
    assert.ok(still.remainingMs <= FIVE_MINUTES_MS);

    mock.timers.tick(FIVE_MINUTES_MS - 1);
    assert.equal(isPinLocked(userId), true);

    mock.timers.tick(1);
    assert.equal(isPinLocked(userId), false);
    const after = recordPinFailure(userId);
    assert.equal(after.locked, false);
  } finally {
    clearPinFailures(userId);
    mock.timers.reset();
  }
});

test("a successful unlock resets the PIN failure counter (QA extension 02 §2.6)", () => {
  const userId = "pin-reset-user";
  mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  try {
    clearPinFailures(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    clearPinFailures(userId);
    assert.equal(isPinLocked(userId), false);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      assert.equal(recordPinFailure(userId).locked, false);
    }
  } finally {
    clearPinFailures(userId);
    mock.timers.reset();
  }
});

test("failures older than 5 minutes do not count toward lockout (QA extension 02 §2.6)", () => {
  const userId = "pin-window-user";
  mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
  try {
    clearPinFailures(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    recordPinFailure(userId);
    mock.timers.tick(FIVE_MINUTES_MS);
    assert.equal(recordPinFailure(userId).locked, false);
    assert.equal(isPinLocked(userId), false);
  } finally {
    clearPinFailures(userId);
    mock.timers.reset();
  }
});

test("shipped PIN lockout copy contains the too-many-attempts warning (QA extension 02 §2.6)", () => {
  const copy = englishCopy()["unlock.pinLocked"] ?? "";
  assert.match(copy.toLowerCase(), /too many attempts/);
  assert.match(copy.toLowerCase(), /master password/);
});

test(
  'QA extension 02 quotes the wrong-master-password error as "wrong master password"',
  { todo: true },
  () => {
    assert.equal(englishCopy()["unlock.errorIncorrectPassword"], "wrong master password");
  },
);

test("popup clears PIN cells after a wrong PIN and does not apply the PIN lock to master password (QA extension 02)", () => {
  const popup = readFileSync(
    new URL("../entrypoints/popup/PopupApp.tsx", import.meta.url),
    "utf8",
  );
  const pinSubmit = popup.slice(
    popup.indexOf("const submitPinUnlock"),
    popup.indexOf("const onUnlockSubmit"),
  );
  assert.match(pinSubmit, /recordPinFailure\(/);
  assert.match(pinSubmit, /setPinDigits\(emptyPinDigits\(\)\)/);
  assert.match(pinSubmit, /unlock\.pinIncorrect/);
  assert.match(pinSubmit, /unlock\.pinLocked/);

  const masterStart = popup.indexOf("const onUnlockSubmit");
  const masterSubmit = popup.slice(masterStart, popup.indexOf("const shellLogo", masterStart));
  assert.doesNotMatch(masterSubmit, /isPinLocked\(/);
  assert.match(masterSubmit, /unlockExtensionVault\(/);
  assert.match(masterSubmit, /unlock\.errorIncorrectPassword/);
});
