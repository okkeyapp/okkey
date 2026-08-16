import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_RESOURCE_PERMISSION_OWN,
  createFullAccessProfilePermissions,
  createSimpleProfilePermissions,
  profileAllowsCategory,
  profileAllowsDatetime,
  profileAllowsEntriesArchive,
  profileAllowsEntriesDelete,
  profileAllowsEntriesGet,
  profileAllowsEntriesPost,
  profileAllowsEntriesPut,
  profileAllowsFieldType,
  profileAllowsFunction,
  profileAllowsItemView,
  type ProfilePermissions,
} from "../../../packages/types/src/workspace-profiles.ts";

test("simple profile: get allowed, post/put/archive/delete denied", () => {
  const ctx = { permissions: createSimpleProfilePermissions(), userId: "u1" };
  assert.equal(profileAllowsEntriesGet(ctx), true);
  assert.equal(profileAllowsEntriesPost(ctx), false);
  assert.equal(profileAllowsEntriesPut(ctx), false);
  assert.equal(profileAllowsEntriesArchive(ctx), false);
  assert.equal(profileAllowsEntriesDelete(ctx), false);
  assert.equal(profileAllowsFunction(ctx, "favorite"), true);
  assert.equal(profileAllowsFunction(ctx, "archive"), false);
});

test("extended profile allows everything", () => {
  const ctx = { permissions: createFullAccessProfilePermissions(), userId: "u1" };
  assert.equal(profileAllowsEntriesPost(ctx), true);
  assert.equal(profileAllowsItemView(ctx, "login"), true);
  assert.equal(profileAllowsFunction(ctx, "create_capsules"), true);
});

test("own scope requires matching creator", () => {
  const permissions: ProfilePermissions = {
    ...createFullAccessProfilePermissions(),
    entries: {
      get: PROFILE_RESOURCE_PERMISSION_OWN,
      post: 1,
      put: PROFILE_RESOURCE_PERMISSION_OWN,
      archive: PROFILE_RESOURCE_PERMISSION_OWN,
      delete: PROFILE_RESOURCE_PERMISSION_OWN,
    },
  };
  const own = {
    permissions,
    userId: "u1",
    itemCreatedByUserId: "u1",
  };
  const other = {
    permissions,
    userId: "u1",
    itemCreatedByUserId: "u2",
  };
  assert.equal(profileAllowsEntriesGet(own), true);
  assert.equal(profileAllowsEntriesPut(own), true);
  assert.equal(profileAllowsEntriesGet(other), false);
  assert.equal(profileAllowsEntriesDelete(other), false);
});

test("category selected / all_except", () => {
  const selected: ProfilePermissions = {
    ...createFullAccessProfilePermissions(),
    rules: [
      { id: "c", kind: "categories", scope: "selected", values: ["login"] },
      { id: "f", kind: "fields", scope: "all", values: [] },
      { id: "fn", kind: "functions", scope: "all", values: [] },
      {
        id: "d",
        kind: "datetime",
        mode: "all_time",
        timeStart: "00:00",
        timeEnd: "23:59",
      },
    ],
  };
  assert.equal(profileAllowsCategory({ permissions: selected }, "login"), true);
  assert.equal(profileAllowsCategory({ permissions: selected }, "credit_card"), false);

  const except: ProfilePermissions = {
    ...selected,
    rules: selected.rules.map((rule) =>
      rule.kind === "categories"
        ? { ...rule, scope: "all_except" as const, values: ["secure_note"] }
        : rule,
    ),
  };
  assert.equal(profileAllowsCategory({ permissions: except }, "login"), true);
  assert.equal(profileAllowsCategory({ permissions: except }, "secure_note"), false);
});

test("field type selected", () => {
  const permissions: ProfilePermissions = {
    ...createFullAccessProfilePermissions(),
    rules: [
      { id: "c", kind: "categories", scope: "all", values: [] },
      { id: "f", kind: "fields", scope: "selected", values: ["password", "totp"] },
      { id: "fn", kind: "functions", scope: "all", values: [] },
      {
        id: "d",
        kind: "datetime",
        mode: "all_time",
        timeStart: "00:00",
        timeEnd: "23:59",
      },
    ],
  };
  assert.equal(profileAllowsFieldType({ permissions }, "password"), true);
  assert.equal(profileAllowsFieldType({ permissions }, "note"), false);
});

test("datetime modes", () => {
  const base = createFullAccessProfilePermissions();
  const mondayMorning = new Date(2026, 7, 10, 10, 30, 0).getTime();

  const weekdays: ProfilePermissions = {
    ...base,
    rules: base.rules.map((rule) =>
      rule.kind === "datetime"
        ? {
            ...rule,
            mode: "repeat_week" as const,
            weekdays: [1, 2, 3, 4, 5],
            timeStart: "09:00",
            timeEnd: "17:00",
          }
        : rule,
    ),
  };
  assert.equal(profileAllowsDatetime({ permissions: weekdays, nowMs: mondayMorning }), true);

  const sunday = new Date(2026, 7, 16, 10, 30, 0).getTime();
  assert.equal(profileAllowsDatetime({ permissions: weekdays, nowMs: sunday }), false);

  const outsideHours = new Date(2026, 7, 10, 20, 0, 0).getTime();
  assert.equal(profileAllowsDatetime({ permissions: weekdays, nowMs: outsideHours }), false);

  const datesOnly: ProfilePermissions = {
    ...base,
    rules: base.rules.map((rule) =>
      rule.kind === "datetime"
        ? {
            ...rule,
            mode: "dates" as const,
            dates: ["2026-08-10"],
            timeStart: "00:00",
            timeEnd: "23:59",
          }
        : rule,
    ),
  };
  assert.equal(profileAllowsDatetime({ permissions: datesOnly, nowMs: mondayMorning }), true);
  assert.equal(profileAllowsDatetime({ permissions: datesOnly, nowMs: sunday }), false);
});

test("item view combines get + datetime + category", () => {
  const permissions: ProfilePermissions = {
    ...createSimpleProfilePermissions(),
    rules: [
      { id: "c", kind: "categories", scope: "selected", values: ["login"] },
      { id: "f", kind: "fields", scope: "all", values: [] },
      {
        id: "fn",
        kind: "functions",
        scope: "selected",
        values: ["favorite", "create_capsules", "save_to_personal"],
      },
      {
        id: "d",
        kind: "datetime",
        mode: "all_time",
        timeStart: "00:00",
        timeEnd: "23:59",
      },
    ],
  };
  assert.equal(profileAllowsItemView({ permissions }, "login"), true);
  assert.equal(profileAllowsItemView({ permissions }, "credit_card"), false);
});
