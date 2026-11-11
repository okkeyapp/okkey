/**
 * DELETE /workspaces/:id/members/:userId forwards workspace_key_rotation.wraps.
 * Pending recipient, pending rotation, and deferred rotation routes call the members service.
 */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import { HttpApp } from "../src/http.ts";
import {
  createWorkspaceKeyDeferredRotationRoute,
  createWorkspaceKeyPendingRecipientsRoute,
  createWorkspaceKeyPendingRotationsRoute,
  createWorkspaceMemberDeleteRoute,
} from "../src/routes/workspace-members.ts";
import type { WorkspaceMembersService } from "../src/workspace-members/service.ts";

const WORKSPACE_ID = "1000000000000000001";
const ACTOR_ID = "2000000000000000001";
const MEMBER_ID = "2000000000000000002";

class MockResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;

  setHeader() {}

  end(chunk?: string) {
    this.writableEnded = true;
    if (chunk) {
      this.body = chunk;
    }
  }
}

function wrap(userId: string, version: number) {
  return {
    user_id: userId,
    encrypted_workspace_key: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(`workspace-key:${userId}:${version}`).toString("base64"),
      meta: {
        entity: "workspace_key_wrap",
        key_version: version,
        recipient_user_id: userId,
      },
    },
  };
}

async function dispatch(input: {
  method: "DELETE" | "GET" | "POST";
  url: string;
  body?: unknown;
  members: Partial<WorkspaceMembersService>;
}) {
  const app = new HttpApp();
  const members = input.members as WorkspaceMembersService;
  if (input.method === "DELETE") {
    app.route(
      "DELETE",
      "/workspaces/:workspaceId/members/:userId",
      createWorkspaceMemberDeleteRoute(members, async () => ACTOR_ID),
    );
  } else if (input.url.endsWith("/pending-recipients")) {
    app.route(
      "GET",
      "/workspaces/:workspaceId/workspace-key/pending-recipients",
      createWorkspaceKeyPendingRecipientsRoute(members, async () => ACTOR_ID),
    );
  } else if (input.url.endsWith("/pending-rotations")) {
    app.route(
      "GET",
      "/workspaces/:workspaceId/workspace-key/pending-rotations",
      createWorkspaceKeyPendingRotationsRoute(members, async () => ACTOR_ID),
    );
  } else {
    app.route(
      "POST",
      "/workspaces/:workspaceId/workspace-key/deferred-rotation",
      createWorkspaceKeyDeferredRotationRoute(members, async () => ACTOR_ID),
    );
  }
  const req = {
    method: input.method,
    url: input.url,
    headers: {},
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("DELETE member passes workspace_key_rotation.wraps through to removeMember", async () => {
  let received: {
    wraps: Array<{ userId: string; encryptedWorkspaceKey: { meta: { key_version: number } } }>;
  } | null = null;
  const res = await dispatch({
    method: "DELETE",
    url: `/workspaces/${WORKSPACE_ID}/members/${MEMBER_ID}`,
    body: { workspace_key_rotation: { wraps: [wrap(ACTOR_ID, 2)] } },
    members: {
      async removeMember(_workspaceId, actorId, targetUserId, rotation) {
        assert.equal(actorId, ACTOR_ID);
        assert.equal(targetUserId, MEMBER_ID);
        received = rotation;
      },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(received?.wraps.length, 1);
  assert.equal(received?.wraps[0]?.userId, ACTOR_ID);
  assert.equal(received?.wraps[0]?.encryptedWorkspaceKey.meta.key_version, 2);
});

test("pending recipient, pending rotation, and deferred rotation routes call the members service", async () => {
  const recipients = await dispatch({
    method: "GET",
    url: `/workspaces/${WORKSPACE_ID}/workspace-key/pending-recipients`,
    members: {
      async listPendingWorkspaceKeyRecipients() {
        return [MEMBER_ID];
      },
    },
  });
  assert.equal(recipients.statusCode, 200);
  assert.deepEqual(JSON.parse(recipients.body), { user_ids: [MEMBER_ID] });

  const rotations = await dispatch({
    method: "GET",
    url: `/workspaces/${WORKSPACE_ID}/workspace-key/pending-rotations`,
    members: {
      async listPendingWorkspaceKeyRotations() {
        return [MEMBER_ID];
      },
    },
  });
  assert.equal(rotations.statusCode, 200);
  assert.deepEqual(JSON.parse(rotations.body), { removed_user_ids: [MEMBER_ID] });

  let deferredWraps = 0;
  const deferred = await dispatch({
    method: "POST",
    url: `/workspaces/${WORKSPACE_ID}/workspace-key/deferred-rotation`,
    body: { wraps: [wrap(ACTOR_ID, 2)] },
    members: {
      async applyDeferredWorkspaceKeyRotation(_workspaceId, _actorId, wraps) {
        deferredWraps = wraps.length;
        return { nextVersion: 2 };
      },
    },
  });
  assert.equal(deferred.statusCode, 200);
  assert.equal(deferredWraps, 1);
  assert.deepEqual(JSON.parse(deferred.body), { current_version: 2 });
});
