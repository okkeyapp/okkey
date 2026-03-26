import assert from "node:assert/strict";
import test from "node:test";
import { assertCryptoVersionNotBelowFloor } from "../../../packages/types/dist/index.js";

test("assertCryptoVersionNotBelowFloor allows unknown floor", () => {
  assertCryptoVersionNotBelowFloor(null, 2);
});

test("assertCryptoVersionNotBelowFloor allows same as floor", () => {
  assertCryptoVersionNotBelowFloor(2, 2);
});

test("assertCryptoVersionNotBelowFloor allows upgrade above floor", () => {
  assertCryptoVersionNotBelowFloor(2, 3);
});

test("assertCryptoVersionNotBelowFloor rejects downgrade below floor", () => {
  assert.throws(
    () => assertCryptoVersionNotBelowFloor(2, 1),
    (e: unknown) => e instanceof Error && e.message.includes("anti-downgrade"),
  );
});

