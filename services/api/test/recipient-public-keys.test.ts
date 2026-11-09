import assert from "node:assert/strict";
import { test } from "node:test";

import { recipientPublicKeysAreValid } from "../src/workspace-members/recipientPublicKeys.ts";

const VALID_PK = Buffer.alloc(32, 1).toString("base64");
const VALID_PQ = Buffer.alloc(1184, 2).toString("base64");

test("recipientPublicKeysAreValid accepts registration lengths", () => {
  assert.equal(recipientPublicKeysAreValid(VALID_PK, VALID_PQ), true);
});

test("recipientPublicKeysAreValid rejects wrong lengths and missing PQ", () => {
  assert.equal(recipientPublicKeysAreValid(Buffer.alloc(16).toString("base64"), VALID_PQ), false);
  assert.equal(recipientPublicKeysAreValid(VALID_PK, Buffer.alloc(32).toString("base64")), false);
  assert.equal(recipientPublicKeysAreValid(VALID_PK, null), false);
  assert.equal(recipientPublicKeysAreValid("", VALID_PQ), false);
});
