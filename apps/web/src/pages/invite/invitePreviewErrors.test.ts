import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { ApiRequestError } from "@okkey/api";

import { invitePreviewErrorFromUnknown } from "./invitePreviewErrors";

it("maps 404 to invalid invitation", () => {
  const err = new ApiRequestError(404, {
    error: "NOT_FOUND",
    message: "missing",
    requestId: "r1",
  });
  assert.deepEqual(invitePreviewErrorFromUnknown(err), { key: "web.invite.invalid" });
});

it("maps AUTH_RATE_LIMITED 429 to rate-limited with minutes", () => {
  const err = new ApiRequestError(429, {
    error: "AUTH_RATE_LIMITED",
    message: "rate limited",
    requestId: "r2",
    details: { retryAfterSeconds: 600 },
  });
  assert.deepEqual(invitePreviewErrorFromUnknown(err), {
    key: "web.invite.errorRateLimited",
    values: { minutes: 10 },
  });
});

it("maps 429 without details to default 10 minutes", () => {
  const err = new ApiRequestError(429, {
    error: "AUTH_RATE_LIMITED",
    message: "rate limited",
    requestId: "r3",
  });
  assert.deepEqual(invitePreviewErrorFromUnknown(err), {
    key: "web.invite.errorRateLimited",
    values: { minutes: 10 },
  });
});

it("maps other errors to generic", () => {
  const err = new ApiRequestError(500, {
    error: "INTERNAL",
    message: "boom",
    requestId: "r4",
  });
  assert.deepEqual(invitePreviewErrorFromUnknown(err), { key: "web.invite.errorGeneric" });
  assert.deepEqual(invitePreviewErrorFromUnknown(new Error("network")), {
    key: "web.invite.errorGeneric",
  });
});
