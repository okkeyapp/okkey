import test from "node:test";
import assert from "node:assert/strict";

import {
  wipeBytes,
  withSensitiveBytes,
  withSensitiveBytesAsync,
} from "../dist/index.js";

test("wipeBytes overwrites buffer with zeros", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  wipeBytes(bytes);
  assert.deepEqual(Array.from(bytes), [0, 0, 0, 0]);
});

test("withSensitiveBytes wipes in finally on success", () => {
  const bytes = new Uint8Array([9, 9, 9]);
  const sum = withSensitiveBytes(bytes, (input) => input[0] + input[1] + input[2]);
  assert.equal(sum, 27);
  assert.deepEqual(Array.from(bytes), [0, 0, 0]);
});

test("withSensitiveBytesAsync wipes in finally on throw", async () => {
  const bytes = new Uint8Array([7, 8, 9]);
  await assert.rejects(async () => {
    await withSensitiveBytesAsync(bytes, async () => {
      throw new Error("boom");
    });
  });
  assert.deepEqual(Array.from(bytes), [0, 0, 0]);
});
