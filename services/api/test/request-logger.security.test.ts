import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRequestUrlForLogs } from "../src/middleware/request-logger.ts";

test("request logger redacts capsule and auth query secrets", () => {
  const sanitized = sanitizeRequestUrlForLogs(
    "/capsules/open?key=abc123&token=qwerty&code=123456&safe=1",
  );
  assert.equal(
    sanitized,
    "/capsules/open?key=%5Bredacted%5D&token=%5Bredacted%5D&code=%5Bredacted%5D&safe=1",
  );
});

test("request logger keeps non-sensitive query params intact", () => {
  const sanitized = sanitizeRequestUrlForLogs("/health?verbose=1");
  assert.equal(sanitized, "/health?verbose=1");
});
