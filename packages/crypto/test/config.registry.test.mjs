import test from "node:test";
import assert from "node:assert/strict";

import {
  CryptoSdkError,
  getCryptoConfig,
  listCryptoConfigs,
} from "../dist/index.js";

test("registry returns v1 and v2 configs", () => {
  const v1 = getCryptoConfig(1);
  const v2 = getCryptoConfig(2);

  assert.equal(v1.id, "v1");
  assert.equal(v1.runtimeMode, "dev_test_legacy");
  assert.equal(v2.id, "v2");
  assert.equal(v2.runtimeMode, "qday_default");
});

test("registry rejects unsupported version with typed error", () => {
  assert.throws(
    () => getCryptoConfig(999),
    (err) =>
      err instanceof CryptoSdkError &&
      err.code === "UNSUPPORTED_ALGORITHM" &&
      err.message.includes("unsupported crypto profile version"),
  );
});

test("registry list is stable and immutable", () => {
  const configs = listCryptoConfigs();
  assert.equal(configs.length, 2);
  assert.equal(configs[0].version, 1);
  assert.equal(configs[1].version, 2);
  assert.ok(Object.isFrozen(configs));
  assert.ok(Object.isFrozen(configs[0]));
  assert.ok(Object.isFrozen(configs[1]));
});
