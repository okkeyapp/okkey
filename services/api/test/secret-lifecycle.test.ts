import test from "node:test";
import assert from "node:assert/strict";

import {
  SENSITIVE_QUERY_PARAM_NAMES,
  withSecretBytes,
  wipeSecretBytes,
} from "../src/crypto/secret-lifecycle.ts";

test("wipeSecretBytes overwrites mutable secret buffer", () => {
  const secret = Buffer.from([1, 2, 3, 4]);
  wipeSecretBytes(secret);
  assert.deepEqual(Array.from(secret), [0, 0, 0, 0]);
});

test("withSecretBytes wipes data in finally", () => {
  const secret = Buffer.from([7, 8, 9]);
  assert.throws(() =>
    withSecretBytes(secret, () => {
      throw new Error("expected");
    }),
  );
  assert.deepEqual(Array.from(secret), [0, 0, 0]);
});

test("sensitive query param set contains auth and secret keys", () => {
  assert.ok(SENSITIVE_QUERY_PARAM_NAMES.has("token"));
  assert.ok(SENSITIVE_QUERY_PARAM_NAMES.has("totp_code"));
  assert.ok(SENSITIVE_QUERY_PARAM_NAMES.has("backup_code"));
});
