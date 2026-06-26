import assert from "node:assert/strict";
import test from "node:test";

import {
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
