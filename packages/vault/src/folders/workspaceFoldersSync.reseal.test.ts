import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePersonalEventsVersionMismatch } from "./personalEventsVersionMismatch.ts";

describe("parsePersonalEventsVersionMismatch", () => {
  it("parses ApiRequestError-shaped VERSION_MISMATCH body", () => {
    const err = {
      name: "ApiRequestError",
      status: 409,
      body: {
        error: "VERSION_MISMATCH",
        message: "baseVersion is stale",
        requestId: "req_test",
        details: {
          expectedBaseVersion: 3,
          latestVersion: 10,
        },
      },
    };
    assert.deepEqual(parsePersonalEventsVersionMismatch(err), {
      expectedBaseVersion: 3,
      latestVersion: 10,
    });
  });

  it("parses bare body-shaped objects", () => {
    assert.deepEqual(
      parsePersonalEventsVersionMismatch({
        error: "VERSION_MISMATCH",
        message: "stale",
        details: { expectedBaseVersion: 1, latestVersion: 2 },
      }),
      { expectedBaseVersion: 1, latestVersion: 2 },
    );
  });

  it("returns null for unrelated errors", () => {
    assert.equal(parsePersonalEventsVersionMismatch(new Error("boom")), null);
    assert.equal(
      parsePersonalEventsVersionMismatch({
        body: {
          error: "SYNC_BAD_REQUEST",
          message: "nope",
          requestId: "req_test",
        },
      }),
      null,
    );
  });
});
