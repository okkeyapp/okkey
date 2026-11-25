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
      }),
    (error: unknown) =>
      error instanceof WorkspacePolicyError && error.code === "WORKSPACE_CREATE_DISABLED",
  );
});

test("assertCanCreateWorkspace allows create on saas", async () => {
  await assertCanCreateWorkspace({
    deploymentMode: "saas",
  });
});
