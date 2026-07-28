import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanCreateWorkspace,
  WorkspacePolicyError,
} from "../src/workspace/workspace-policy.ts";

test("assertCanCreateWorkspace allows first workspace on self_hosted", async () => {
  await assertCanCreateWorkspace({
    deploymentMode: "self_hosted",
    ownerId: "owner-1",
    workspaces: {
      countOwnedByUser: async () => 0,
    },
  });
});

test("assertCanCreateWorkspace rejects second workspace on self_hosted", async () => {
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
      error instanceof WorkspacePolicyError && error.code === "WORKSPACE_LIMIT_REACHED",
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
