import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyPermissionsMatrix,
  fullPermissionsMatrix,
  parsePermissionsMatrix,
  permissionAllowsGet,
  permissionAllowsObject,
  permissionAllowsPost,
} from "../src/workspace-roles/permissions.ts";

test("parsePermissionsMatrix inherits nested settings from settings when missing", () => {
  const matrix = parsePermissionsMatrix({
    settings: { get: 1, post: 0, put: 1, delete: 0 },
    members: { get: 1, post: 1, put: 0, delete: 2 },
  });
  assert.equal(matrix.settings_items.get, 1);
  assert.equal(matrix.settings_items.put, 1);
  assert.equal(matrix.settings_items.post, 0);
  assert.equal(matrix.settings_capsules.get, 1);
  assert.equal(matrix.settings_capsules.put, 1);
  assert.equal(matrix.members.delete, 2);
});

test("parsePermissionsMatrix keeps explicit nested settings zeros", () => {
  const matrix = parsePermissionsMatrix({
    settings: { get: 1, post: 0, put: 1, delete: 0 },
    settings_items: { get: 0, post: 0, put: 0, delete: 0 },
    settings_capsules: { get: 1, post: 0, put: 0, delete: 0 },
  });
  assert.equal(matrix.settings_items.get, 0);
  assert.equal(matrix.settings_capsules.get, 1);
  assert.equal(matrix.settings_capsules.put, 0);
});

test("full and empty permission matrices", () => {
  const full = fullPermissionsMatrix();
  const empty = emptyPermissionsMatrix();
  assert.equal(full.members.get, 1);
  assert.equal(full.members.post, 1);
  assert.equal(empty.members.get, 0);
  assert.equal(empty.members.post, 0);
});

test("permissionAllowsObject honors all vs own vs none", () => {
  assert.equal(permissionAllowsObject(1, false), true);
  assert.equal(permissionAllowsObject(1, true), true);
  assert.equal(permissionAllowsObject(2, true), true);
  assert.equal(permissionAllowsObject(2, false), false);
  assert.equal(permissionAllowsObject(0, true), false);
  assert.equal(permissionAllowsGet(2), true);
  assert.equal(permissionAllowsPost(0), false);
  assert.equal(permissionAllowsPost(1), true);
});
