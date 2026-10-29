import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ENTITY_ID,
  SnowflakeGenerator,
  createEntityIdGenerator,
  isEntityId,
} from "../dist/index.js";

test("snowflake generates decimal entity ids", () => {
  const gen = createEntityIdGenerator(42);
  const a = gen.next();
  const b = gen.next();
  assert.ok(isEntityId(a));
  assert.ok(isEntityId(b));
  assert.notEqual(a, b);
  assert.ok(BigInt(b) > BigInt(a));
});

test("snowflake rejects invalid node id", () => {
  assert.throws(() => new SnowflakeGenerator(1024), /nodeId/);
});

test("isEntityId accepts signed int64-max and rejects out-of-range decimals", () => {
  assert.ok(isEntityId("1000000000"));
  assert.ok(isEntityId(MAX_ENTITY_ID.toString()));
  // 20 digits, greater than 2^63-1 — digit shape matches ENTITY_ID_RE but not Postgres bigint.
  assert.equal(isEntityId("12345678901234567890"), false);
  assert.equal(isEntityId((MAX_ENTITY_ID + 1n).toString()), false);
  assert.equal(isEntityId("abc"), false);
  assert.equal(isEntityId("0000000001"), false);
});
