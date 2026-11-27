import assert from "node:assert/strict";
import { test } from "node:test";

import {
  biometricErrorMessageKey,
  mapWebAuthnError,
  readPrfFirst,
} from "./extensionBiometricUnlock.ts";

test("extension biometricErrorMessageKey covers prf_unavailable", () => {
  assert.equal(
    biometricErrorMessageKey("prf_unavailable"),
    "web.settingsPopup.vault.biometric.error.prfUnavailable",
  );
  assert.equal(
    biometricErrorMessageKey("unavailable"),
    "web.settingsPopup.vault.biometric.error.unavailable",
  );
});

test("extension mapWebAuthnError maps cancelled and unsupported", () => {
  assert.equal(mapWebAuthnError(Object.assign(new Error("x"), { name: "NotAllowedError" })), "cancelled");
  assert.equal(mapWebAuthnError(Object.assign(new Error("x"), { name: "NotSupportedError" })), "unsupported");
  assert.equal(mapWebAuthnError(null), "failed");
});

test("extension readPrfFirst accepts ArrayBuffer and rejects short outputs", () => {
  const bytes = new Uint8Array(32).fill(7);
  assert.deepEqual(readPrfFirst({ prf: { results: { first: bytes.buffer } } }), bytes);
  assert.equal(readPrfFirst({ prf: { results: { first: new Uint8Array(16) } } }), null);
  assert.equal(readPrfFirst({}), null);
});
