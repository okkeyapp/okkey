import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_RESOURCE_PERMISSION_ALL,
  PROFILE_RESOURCE_PERMISSION_NONE,
  createEmptyProfilePermissions,
  createFullAccessProfilePermissions,
  createSimpleProfilePermissions,
  ensureProfilePermissions,
  getBuiltInProfilePermissions,
} from "../../../packages/types/src/workspace-profiles.ts";

test("built-in extended profile has full access rules", () => {
  const permissions = getBuiltInProfilePermissions("extended");
  assert.deepEqual(permissions, createFullAccessProfilePermissions());
  assert.equal(permissions.rules.length, 4);
  assert.equal(permissions.entries.get, PROFILE_RESOURCE_PERMISSION_ALL);
});

test("built-in simple profile allows favorite, capsules, and save_to_personal via functions", () => {
  const permissions = getBuiltInProfilePermissions("simple");
  assert.deepEqual(permissions, createSimpleProfilePermissions());
  const functions = permissions.rules.find((rule) => rule.kind === "functions");
  assert.ok(functions && functions.kind === "functions");
  assert.equal(functions.scope, "selected");
  assert.deepEqual(functions.values, ["favorite", "create_capsules", "save_to_personal"]);
  assert.equal(permissions.entries.get, PROFILE_RESOURCE_PERMISSION_ALL);
  assert.equal(permissions.entries.post, PROFILE_RESOURCE_PERMISSION_NONE);
});

test("empty profile permissions include fixed scope rows", () => {
  const permissions = createEmptyProfilePermissions();
  assert.equal(permissions.rules.length, 4);
  assert.deepEqual(
    permissions.rules.map((rule) => rule.kind),
    ["categories", "fields", "functions", "datetime"],
  );
  assert.equal(permissions.entries.get, PROFILE_RESOURCE_PERMISSION_ALL);
});

test("ensureProfilePermissions migrates legacy entries actions", () => {
  const permissions = ensureProfilePermissions({
    rules: [
      { id: "c", kind: "categories", scope: "all", values: [] },
      { id: "f", kind: "fields", scope: "all", values: [] },
      {
        id: "e",
        kind: "entries",
        scope: "selected",
        values: ["save_to_personal", "create", "edit_own"],
      },
      {
        id: "d",
        kind: "datetime",
        mode: "time_only",
        timeStart: "09:00",
        timeEnd: "17:00",
      },
    ],
  });
  const functions = permissions.rules.find((rule) => rule.kind === "functions");
  assert.ok(functions && functions.kind === "functions");
  assert.deepEqual(functions.values, ["save_to_personal"]);
  assert.equal(permissions.entries.post, PROFILE_RESOURCE_PERMISSION_ALL);
  assert.equal(permissions.entries.put, 2);
  assert.deepEqual(
    permissions.rules.map((rule) => rule.kind),
    ["categories", "fields", "functions", "datetime"],
  );
});
