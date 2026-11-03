import assert from "node:assert/strict";
import test from "node:test";

import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import {
  parseGuestSessionId,
  readGuestSessionIdQuery,
} from "../src/capsule/guest-session-id.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import { testEntityId } from "./test-entity-id.ts";

test("parseGuestSessionId accepts UUID and guest tokens", () => {
  assert.equal(
    parseGuestSessionId("550e8400-e29b-41d4-a716-446655440000").kind,
    "value",
  );
  assert.equal(parseGuestSessionId(`guest-session-${testEntityId()}`).kind, "value");
  assert.equal(parseGuestSessionId(`guest-session-soft-${testEntityId()}`).kind, "value");
  assert.equal(parseGuestSessionId("guest-1730000000000-k3j8s2abcd").kind, "value");
  assert.equal(parseGuestSessionId(undefined).kind, "absent");
  assert.equal(parseGuestSessionId("   ").kind, "absent");
});

test("parseGuestSessionId rejects NUL and other malformed tokens", () => {
  assert.equal(parseGuestSessionId("\0").kind, "invalid");
  assert.equal(parseGuestSessionId("550e8400-e29b-41d4-a716-446655440000\0").kind, "invalid");
  assert.equal(parseGuestSessionId("not-a-session").kind, "invalid");
  assert.equal(parseGuestSessionId("guest").kind, "invalid");
  assert.equal(parseGuestSessionId("bad id").kind, "invalid");
  assert.equal(
    readGuestSessionIdQuery("/capsule-approval-requests/1?guestSessionId=%00").kind,
    "invalid",
  );
  assert.equal(
    readGuestSessionIdQuery("/capsule-approval-requests/1").kind,
    "absent",
  );
});

test("getApprovalStatus rejects a malformed guestSessionId before querying", async () => {
  let queried = false;
  const service = new CapsuleService({
    db: {
      query: async () => {
        queried = true;
        throw new Error("should not query");
      },
      transaction: async () => {
        throw new Error("should not query");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    config: createTestApiConfig(),
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
      deleteObject: async () => {},
    },
  });

  await assert.rejects(
    () => service.getApprovalStatus(testEntityId(), undefined, "\0"),
    (error: unknown) =>
      error instanceof CapsuleServiceError && error.code === "INVALID_GUEST_SESSION_ID",
  );
  await assert.rejects(
    () => service.getApprovalStatus(testEntityId(), testEntityId(), "not-a-session"),
    (error: unknown) =>
      error instanceof CapsuleServiceError && error.code === "INVALID_GUEST_SESSION_ID",
  );
  assert.equal(queried, false);
});
