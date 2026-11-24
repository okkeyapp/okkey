/**
 * POST /workspaces/:workspaceId/invitations must return 400 (never 500) for
 * invalid path workspace ids and malformed JSON bodies.
 */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import { HttpApp } from "../src/http.ts";
import { createWorkspaceInvitationsCreateRoute } from "../src/routes/workspace-members.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";

class MockResponse {
  statusCode = 200;
  body = "";
  writableEnded = false;
  headers: Record<string, string> = {};

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  end(chunk?: string) {
    this.writableEnded = true;
    if (chunk) {
      this.body = chunk;
    }
  }
}

function membersStub(
  overrides: Partial<WorkspaceMembersService> = {},
): WorkspaceMembersService {
  return {
    ensureWorkspaceAccess: async () => {},
    createInvitations: async () => {
      throw new Error("createInvitations should not be reached");
    },
    ...overrides,
  } as unknown as WorkspaceMembersService;
}

async function dispatch(input: {
  url: string;
  body?: unknown;
  members?: WorkspaceMembersService;
  userId?: string | null;
}) {
  const app = new HttpApp();
  app.route(
    "POST",
    "/workspaces/:workspaceId/invitations",
    createWorkspaceInvitationsCreateRoute(
      input.members ?? membersStub(),
      async () => input.userId ?? "1000000000000000001",
    ),
  );
  const req = {
    method: "POST",
    url: input.url,
    headers: {},
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

test("POST /workspaces/abc/invitations returns 400 INVALID_WORKSPACE_ID", async () => {
  const res = await dispatch({
    url: "/workspaces/abc/invitations",
    body: { invitations: [{ email: "a@example.com", roleId: "1000000000000000002" }] },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INVALID_WORKSPACE_ID");
});

test("POST invitations with malformed JSON string body returns 400 BAD_REQUEST", async () => {
  const res = await dispatch({
    url: "/workspaces/1000000000000000100/invitations",
    body: "{not-json",
    members: membersStub({
      ensureWorkspaceAccess: async () => {},
    }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string; message: string };
  assert.equal(payload.error, "BAD_REQUEST");
  assert.match(payload.message, /invalid JSON/i);
});

test("POST invitations with null body returns 400 body must be an object", async () => {
  const res = await dispatch({
    url: "/workspaces/1000000000000000100/invitations",
    body: null,
    members: membersStub({
      ensureWorkspaceAccess: async () => {},
    }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string; message: string };
  assert.equal(payload.error, "BAD_REQUEST");
  assert.match(payload.message, /body must be an object/i);
});

test("POST invitations checks access before body validation", async () => {
  let accessChecked = false;
  const res = await dispatch({
    url: "/workspaces/1000000000000000100/invitations",
    body: "{not-json",
    members: membersStub({
      ensureWorkspaceAccess: async () => {
        accessChecked = true;
        throw new WorkspaceMembersServiceError("ACCESS_DENIED", 403, "access denied");
      },
    }),
  });
  assert.equal(accessChecked, true);
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "ACCESS_DENIED");
});

test("POST invitations maps service INVALID_WORKSPACE_ID to 400", async () => {
  const res = await dispatch({
    url: "/workspaces/1000000000000000100/invitations",
    body: { invitations: [{ email: "a@example.com", roleId: "1000000000000000002" }] },
    members: membersStub({
      ensureWorkspaceAccess: async () => {},
      createInvitations: async () => {
        throw new WorkspaceMembersServiceError(
          "INVALID_WORKSPACE_ID",
          400,
          "workspaceId must be a snowflake entity id",
        );
      },
    }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INVALID_WORKSPACE_ID");
});
