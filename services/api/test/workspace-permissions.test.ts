import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyPermissionsMatrix,
  fullPermissionsMatrix,
  parsePermissionsMatrix,
} from "../src/workspace-roles/permissions.ts";

test("parsePermissionsMatrix reads members cells", () => {
  const matrix = parsePermissionsMatrix({
    members: { get: 1, post: 1, put: 0, delete: 2 },
  });
  assert.equal(matrix.members.get, 1);
  assert.equal(matrix.members.post, 1);
  assert.equal(matrix.members.put, 0);
  assert.equal(matrix.members.delete, 2);
  assert.equal(matrix.roles.get, 0);
});

test("full and empty permission matrices", () => {
  const full = fullPermissionsMatrix();
  const empty = emptyPermissionsMatrix();
  assert.equal(full.members.get, 1);
  assert.equal(full.members.post, 1);
  assert.equal(empty.members.get, 0);
  assert.equal(empty.members.post, 0);
});
