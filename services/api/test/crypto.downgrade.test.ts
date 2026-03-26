import assert from "node:assert/strict";
import test from "node:test";
import { assertPayloadSchemaMonotonic } from "../src/crypto/downgrade.ts";
import { CryptoDowngradeInvariantError } from "../src/storage/errors.ts";

test("assertPayloadSchemaMonotonic allows first event (no established max)", () => {
  assertPayloadSchemaMonotonic("vault-a", null, 1);
  assertPayloadSchemaMonotonic("vault-a", null, 2);
});

test("assertPayloadSchemaMonotonic allows same version as max", () => {
  assertPayloadSchemaMonotonic("vault-a", 2, 2);
});

test("assertPayloadSchemaMonotonic allows upgrade above max", () => {
  assertPayloadSchemaMonotonic("vault-a", 1, 2);
});

test("assertPayloadSchemaMonotonic rejects downgrade", () => {
  assert.throws(
    () => assertPayloadSchemaMonotonic("vault-a", 2, 1),
    (e: unknown) =>
      e instanceof CryptoDowngradeInvariantError &&
      e.vaultId === "vault-a" &&
      e.establishedMaxVersion === 2 &&
      e.requestedVersion === 1,
  );
});
