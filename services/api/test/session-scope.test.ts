import test from "node:test";
import assert from "node:assert/strict";
import { generateAuthStateId } from "../src/auth/service.ts";
import {
  isFullSessionScope,
  REGISTRATION_RECOVERY_ALLOWED_SCOPES,
  SESSION_SCOPE_REGISTRATION_RECOVERY,
  sessionScopeAllowed,
} from "../src/session/scopes.ts";

test("generateAuthStateId is 128-bit hex and not snowflake-shaped", () => {
  const id = generateAuthStateId();
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(/^\d{10,20}$/.test(id), false);
  const other = generateAuthStateId();
  assert.notEqual(id, other);
});

test("sessionScopeAllowed accepts full vs registration_recovery", () => {
  assert.equal(isFullSessionScope(null), true);
  assert.equal(isFullSessionScope(SESSION_SCOPE_REGISTRATION_RECOVERY), false);
  assert.equal(sessionScopeAllowed(null, [null]), true);
  assert.equal(sessionScopeAllowed(SESSION_SCOPE_REGISTRATION_RECOVERY, [null]), false);
  assert.equal(
    sessionScopeAllowed(SESSION_SCOPE_REGISTRATION_RECOVERY, REGISTRATION_RECOVERY_ALLOWED_SCOPES),
    true,
  );
  assert.equal(sessionScopeAllowed(null, REGISTRATION_RECOVERY_ALLOWED_SCOPES), true);
});
