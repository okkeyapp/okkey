import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeCapsuleAccessDefaults,
  parseCapsuleAccessDefaultsPayload,
  parseCapsuleDefaultsType,
} from "../src/capsule-defaults/service.ts";

test("parseCapsuleDefaultsType accepts known types only", () => {
  assert.equal(parseCapsuleDefaultsType("text"), "text");
  assert.equal(parseCapsuleDefaultsType("file"), "file");
  assert.equal(parseCapsuleDefaultsType("item"), "item");
  assert.equal(parseCapsuleDefaultsType("field"), null);
  assert.equal(parseCapsuleDefaultsType(1), null);
});

test("parseCapsuleAccessDefaultsPayload rejects non-objects", () => {
  assert.equal(parseCapsuleAccessDefaultsPayload(null), null);
  assert.equal(parseCapsuleAccessDefaultsPayload([]), null);
  assert.deepEqual(parseCapsuleAccessDefaultsPayload({ viewsEnabled: true }), {
    viewsEnabled: true,
    maxViews: 1,
    viewLimitAction: "deactivate",
    timeEnabled: false,
    activatePreset: "now",
    deactivatePreset: "never",
    deletePreset: "never",
    accessEnabled: false,
    passwordEnabled: false,
    attemptLimit: 3,
    approvalRequired: false,
  });
});

test("normalizeCapsuleAccessDefaults clamps numbers and presets", () => {
  assert.deepEqual(
    normalizeCapsuleAccessDefaults({
      viewsEnabled: 1,
      maxViews: 2.8,
      viewLimitAction: "delete",
      timeEnabled: true,
      activatePreset: "6h",
      deactivatePreset: "bad",
      deletePreset: "24h",
      accessEnabled: false,
      passwordEnabled: true,
      attemptLimit: 0,
      approvalRequired: true,
    }),
    {
      viewsEnabled: true,
      maxViews: 2,
      viewLimitAction: "delete",
      timeEnabled: true,
      activatePreset: "6h",
      deactivatePreset: "never",
      deletePreset: "24h",
      accessEnabled: false,
      passwordEnabled: true,
      attemptLimit: 1,
      approvalRequired: true,
    },
  );
});
