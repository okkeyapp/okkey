/**
 * GET /workspaces/:workspaceId/member-directory is the capsule recipients picker
 * and activity labels. Any workspace member may read it; outsiders may not.
 */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";

import { HttpApp } from "../src/http.ts";
import type { WorkspaceRecord } from "../src/storage/repositories.ts";
import { createWorkspaceMemberDirectoryRoute } from "../src/routes/workspace-members.ts";
import { WorkspaceMembersService } from "../src/workspace-members/service.ts";

const WORKSPACE_ID = "1000000000000000100";
const MEMBER_ID = "1000000000000000001";
const OTHER_MEMBER_ID = "1000000000000000002";
const OUTSIDER_ID = "1000000000000000009";

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

function memberRow(input: {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}) {
  return {
    user_id: input.userId,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    public_key: "pk",
    public_pq_key: null,
    role_id: "1000000000000000200",
    role_builtin_key: input.userId === MEMBER_ID ? "owner" : "user",
    role_name: input.userId === MEMBER_ID ? "Owner" : "User",
    joined_at: "2026-01-01T00:00:00.000Z",
    invited_at: null,
    role_changed_at: null,
    invited_by_user_id: null,
    invited_by_email: null,
    invited_by_first_name: null,
    invited_by_last_name: null,
    role_changed_by_user_id: null,
    role_changed_by_email: null,
    role_changed_by_first_name: null,
    role_changed_by_last_name: null,
    last_login_at: null,
  };
}

function createMembersService() {
  const queried: string[] = [];
  const service = new WorkspaceMembersService({
    db: {
      async query<T>(_sql: string, params?: unknown[]): Promise<T[]> {
        queried.push(String(params?.[0] ?? ""));
        return [
          memberRow({
            userId: MEMBER_ID,
            email: "owner@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          }),
          memberRow({
            userId: OTHER_MEMBER_ID,
            email: "member@example.com",
            firstName: null,
            lastName: null,
          }),
          // Pending-style or unbound rows must not leak into the directory.
          { ...memberRow({ userId: "", email: "pending@example.com", firstName: "Pat", lastName: null }), user_id: "" },
        ] as T[];
      },
    },
    workspaces: {
      async findById(workspaceId: string) {
        if (workspaceId !== WORKSPACE_ID) {
          return null;
        }
        return {
          id: WORKSPACE_ID,
          ownerId: MEMBER_ID,
          name: "Workspace",
        } as WorkspaceRecord;
      },
      async hasAccess(workspaceId: string, userId: string) {
        return workspaceId === WORKSPACE_ID && (userId === MEMBER_ID || userId === OTHER_MEMBER_ID);
      },
    },
  });
  return { service, queried };
}

async function dispatch(input: { userId: string | null; workspaceId?: string }) {
  const { service, queried } = createMembersService();
  const app = new HttpApp();
  app.route(
    "GET",
    "/workspaces/:workspaceId/member-directory",
    createWorkspaceMemberDirectoryRoute(service, async () => input.userId),
  );
  const workspaceId = input.workspaceId ?? WORKSPACE_ID;
  const req = {
    method: "GET",
    url: `/workspaces/${workspaceId}/member-directory`,
    headers: {},
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return { res, queried };
}

test("GET member-directory returns active members for a workspace member", async () => {
  const { res, queried } = await dispatch({ userId: OTHER_MEMBER_ID });
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body) as {
    workspaceId: string;
    members: Array<{ userId: string; email: string; firstName: string | null; lastName: string | null }>;
  };
  assert.equal(payload.workspaceId, WORKSPACE_ID);
  assert.deepEqual(payload.members, [
    {
      userId: MEMBER_ID,
      email: "owner@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    },
    {
      userId: OTHER_MEMBER_ID,
      email: "member@example.com",
      firstName: null,
      lastName: null,
    },
  ]);
  assert.deepEqual(queried, [WORKSPACE_ID]);
});

test("GET member-directory returns 403 for a non-member of an existing workspace", async () => {
  const { res, queried } = await dispatch({ userId: OUTSIDER_ID });
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "ACCESS_DENIED");
  assert.deepEqual(queried, []);
});

test("GET member-directory returns 404 when the workspace does not exist", async () => {
  const { res, queried } = await dispatch({
    userId: MEMBER_ID,
    workspaceId: "1000000000000000999",
  });
  assert.equal(res.statusCode, 404);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "WORKSPACE_NOT_FOUND");
  assert.deepEqual(queried, []);
});
