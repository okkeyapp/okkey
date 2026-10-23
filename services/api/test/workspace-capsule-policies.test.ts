import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  isCapsuleTypeAllowed,
  mergeCapsulePoliciesForPlan,
  resolveEffectiveCapsulePolicies,
  workspaceCapsulePoliciesFromDto,
  workspaceCapsulePoliciesToDto,
} from "../../../packages/types/src/workspace-capsule-policies.ts";

test("resolveEffectiveCapsulePolicies keeps EE fields when access settings enabled", () => {
  const stored = {
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    requirePassword: true,
    requireApproval: true,
    forceMaxViews: 3,
  };
  assert.deepEqual(resolveEffectiveCapsulePolicies(stored, true), stored);
});

test("resolveEffectiveCapsulePolicies resets EE fields on FREE but keeps Core fields", () => {
  const stored = {
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    allowMode: "selected" as const,
    allowMemberIds: ["u1"],
    allowedCapsuleTypes: ["text" as const],
    forceMaxViews: 5,
    requirePassword: true,
    requireApproval: true,
    requireAccess: true,
    requireTimeDeactivation: true,
    passwordAttemptLimit: 7,
    accessAudience: "workspace_members_only" as const,
  };
  const effective = resolveEffectiveCapsulePolicies(stored, false);
  assert.equal(effective.allowMode, "selected");
  assert.deepEqual(effective.allowMemberIds, ["u1"]);
  assert.deepEqual(effective.allowedCapsuleTypes, ["text"]);
  assert.equal(effective.forceMaxViews, 5);
  assert.equal(effective.requirePassword, false);
  assert.equal(effective.requireApproval, false);
  assert.equal(effective.requireAccess, false);
  assert.equal(effective.requireTimeDeactivation, false);
  assert.equal(effective.passwordAttemptLimit, 0);
  assert.equal(effective.accessAudience, "all_users");
});

test("mergeCapsulePoliciesForPlan preserves stored EE fields when FREE", () => {
  const existing = {
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    requirePassword: true,
    passwordAttemptLimit: 4,
  };
  const patch = {
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    allowMode: "none" as const,
    forceMaxViews: 2,
    requirePassword: false,
    passwordAttemptLimit: 0,
  };
  const merged = mergeCapsulePoliciesForPlan(existing, patch, false);
  assert.equal(merged.allowMode, "none");
  assert.equal(merged.forceMaxViews, 2);
  assert.equal(merged.requirePassword, true);
  assert.equal(merged.passwordAttemptLimit, 4);
});

test("allowed capsule types round-trip and default to all", () => {
  const fromMissing = workspaceCapsulePoliciesFromDto({
    allow_mode: "all",
    allow_member_ids: [],
  });
  assert.deepEqual(fromMissing.allowedCapsuleTypes, ["text", "file", "item"]);

  const dto = workspaceCapsulePoliciesToDto({
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    allowedCapsuleTypes: ["file", "item"],
  });
  assert.deepEqual(dto.allowed_capsule_types, ["file", "item"]);
  assert.equal(isCapsuleTypeAllowed(workspaceCapsulePoliciesFromDto(dto), "text"), false);
  assert.equal(isCapsuleTypeAllowed(workspaceCapsulePoliciesFromDto(dto), "file"), true);
});
