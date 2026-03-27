import test from "node:test";
import assert from "node:assert/strict";
import { assertVaultCryptoFloor } from "../src/crypto/downgrade.ts";
import { CryptoDowngradeInvariantError } from "../src/storage/errors.ts";

test("assertVaultCryptoFloor allows equal or higher version", () => {
  assertVaultCryptoFloor("v1", 2, 2);
  assertVaultCryptoFloor("v1", 2, 3);
});

test("assertVaultCryptoFloor rejects below vault floor", () => {
  assert.throws(
    () => assertVaultCryptoFloor("v1", 2, 1),
    (e: unknown) =>
      e instanceof CryptoDowngradeInvariantError &&
      (e as CryptoDowngradeInvariantError).establishedMaxVersion === 2 &&
      (e as CryptoDowngradeInvariantError).requestedVersion === 1,
  );
});
