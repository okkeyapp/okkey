import test from "node:test";
import assert from "node:assert/strict";
import {
  canReclaimSoleTrustedDevice,
  isLegacyHexFingerprint,
} from "@okkey/types";

const LEGACY = "ab".repeat(32);
const NEXT = "web_app-chrome-linux-6";

test("isLegacyHexFingerprint matches the 32-128 hex rule", () => {
  assert.equal(isLegacyHexFingerprint(LEGACY), true);
  assert.equal(isLegacyHexFingerprint(`  ${LEGACY.toUpperCase()}  `), true);
  assert.equal(isLegacyHexFingerprint("a".repeat(31)), false);
  assert.equal(isLegacyHexFingerprint("a".repeat(128)), true);
  assert.equal(isLegacyHexFingerprint("a".repeat(129)), false);
  assert.equal(isLegacyHexFingerprint(NEXT), false);
  assert.equal(isLegacyHexFingerprint(`${LEGACY}g`), false);
});

test("canReclaimSoleTrustedDevice mirrors the legacy fingerprint and client-type rule", () => {
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "web",
      nextFingerprint: NEXT,
      nextClientType: "web_app",
    }),
    true,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "web_app",
      nextFingerprint: NEXT,
      nextClientType: "web_app",
    }),
    true,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "unknown",
      nextFingerprint: NEXT,
      nextClientType: "desktop_app",
    }),
    true,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "",
      nextFingerprint: NEXT,
      nextClientType: "web_app",
    }),
    true,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: NEXT,
      storedClientType: "web",
      nextFingerprint: "web_app-firefox-linux-6",
      nextClientType: "web_app",
    }),
    false,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "web",
      nextFingerprint: LEGACY,
      nextClientType: "web_app",
    }),
    false,
  );
  assert.equal(
    canReclaimSoleTrustedDevice({
      storedFingerprint: LEGACY,
      storedClientType: "desktop",
      nextFingerprint: NEXT,
      nextClientType: "web_app",
    }),
    false,
  );
});
