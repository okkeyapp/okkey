import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTITY_ID_PATH_PARAM_NAMES,
  findInvalidEntityIdPathParam,
  invalidEntityIdErrorCode,
  normalizeEntityIdPathParams,
  parseOptionalEntityId,
} from "../src/http-params.ts";

test("findInvalidEntityIdPathParam rejects non-entity and out-of-range ids", () => {
  assert.equal(findInvalidEntityIdPathParam({ vaultId: "1000000000" }), null);
  assert.deepEqual(findInvalidEntityIdPathParam({ vaultId: "abc" }), {
    name: "vaultId",
    value: "abc",
  });
  assert.deepEqual(findInvalidEntityIdPathParam({ workspaceId: "12345678901234567890" }), {
    name: "workspaceId",
    value: "12345678901234567890",
  });
  assert.equal(ENTITY_ID_PATH_PARAM_NAMES.has("credentialId"), true);
  assert.deepEqual(findInvalidEntityIdPathParam({ credentialId: "not-a-snowflake" }), {
    name: "credentialId",
    value: "not-a-snowflake",
  });
});

test("findInvalidEntityIdPathParam rejects surrounding whitespace", () => {
  assert.deepEqual(findInvalidEntityIdPathParam({ vaultId: " 1000000000" }), {
    name: "vaultId",
    value: " 1000000000",
  });
});

test("normalizeEntityIdPathParams trims allowlisted params", () => {
  assert.deepEqual(
    normalizeEntityIdPathParams({ vaultId: "1000000000", other: " x " }),
    { vaultId: "1000000000", other: " x " },
  );
});

test("invalidEntityIdErrorCode maps camelCase params", () => {
  assert.equal(invalidEntityIdErrorCode("vaultId"), "INVALID_VAULT_ID");
  assert.equal(invalidEntityIdErrorCode("attachmentId"), "INVALID_ATTACHMENT_ID");
  assert.equal(invalidEntityIdErrorCode("workspaceId"), "INVALID_WORKSPACE_ID");
  assert.equal(invalidEntityIdErrorCode("credentialId"), "INVALID_CREDENTIAL_ID");
});

test("parseOptionalEntityId distinguishes omit / clear / value / invalid", () => {
  assert.deepEqual(parseOptionalEntityId(undefined), { kind: "omitted" });
  assert.deepEqual(parseOptionalEntityId(null), { kind: "clear" });
  assert.deepEqual(parseOptionalEntityId(""), { kind: "clear" });
  assert.deepEqual(parseOptionalEntityId("abc"), { kind: "invalid" });
  assert.deepEqual(parseOptionalEntityId("12345678901234567890"), { kind: "invalid" });
  assert.deepEqual(parseOptionalEntityId("1000000000"), { kind: "value", id: "1000000000" });
});
