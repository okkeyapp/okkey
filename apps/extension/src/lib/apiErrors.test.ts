import test from "node:test";
import assert from "node:assert/strict";

import { isUnauthorizedApiError } from "./apiErrors.ts";

test("isUnauthorizedApiError matches ApiRequestError-shaped 401", () => {
  assert.equal(isUnauthorizedApiError({ name: "ApiRequestError", status: 401 }), true);
  assert.equal(isUnauthorizedApiError({ name: "ApiRequestError", status: 403 }), false);
  assert.equal(isUnauthorizedApiError({ name: "Error", status: 401 }), false);
  assert.equal(isUnauthorizedApiError(new Error("nope")), false);
  assert.equal(isUnauthorizedApiError(null), false);
});
