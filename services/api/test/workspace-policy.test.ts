import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanCreateWorkspace,
  WorkspacePolicyError,
} from "../src/workspace/workspace-policy.ts";

test("assertCanCreateWorkspace rejects any create on self_hosted", async () => {
  await assert.rejects(
    () =>
      assertCanCreateWorkspace({
        deploymentMode: "self_hosted",
        ownerId: "owner-1",
        workspaces: {
          countOwnedByUser: async () => 0,
        },
      }),
    (error: unknown) =>
      error instanceof WorkspacePolicyError && error.code === "WORKSPACE_CREATE_DISABLED",
  );
});

test("assertCanCreateWorkspace rejects when owner already has a workspace on self_hosted", async () => {
  await assert.rejects(
    () =>
      assertCanCreateWorkspace({
        deploymentMode: "self_hosted",
        ownerId: "owner-1",
        workspaces: {
          countOwnedByUser: async () => 1,
        },
      }),
    (error: unknown) =>
      error instanceof WorkspacePolicyError && error.code === "WORKSPACE_CREATE_DISABLED",
  );
});

test("assertCanCreateWorkspace allows multiple on saas", async () => {
  await assertCanCreateWorkspace({
    deploymentMode: "saas",
    ownerId: "owner-1",
    workspaces: {
      countOwnedByUser: async () => 5,
    },
  });
});
