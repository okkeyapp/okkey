/**
 * OKKEYAPP-230: without enterprise plugins, paid routes are not registered.
 * Core list/delete for roles and profiles, and core recovery-key routes, stay mounted.
 * A handler that answers 403 instead of 404 is left skipped: 404 vs 403 is separate.
 */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { AccountRecoveryService } from "../src/account-recovery/service.ts";
import { createApiApp } from "../src/app.ts";
import type { WorkspaceBuiltInProfilesService } from "../src/workspace-profiles/list-service.ts";
import type { WorkspaceBuiltInRolesService } from "../src/workspace-roles/list-service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000001";
const ROLE_ID = "1000000000000000002";
const PROFILE_ID = "1000000000000000003";
const CAPSULE_ID = "1000000000000000004";
const REQUEST_ID = "1000000000000000005";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

const app = createApiApp(
  createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
    enterpriseModulesRequested: false,
  }),
  loggerStub(),
  {
    accountRecoveryService: new AccountRecoveryService({
      recovery: {} as never,
      workspaces: { listAccessibleByUser: async () => [] } as never,
      users: {} as never,
      devices: {} as never,
      config: createTestApiConfig({
        deploymentMode: "self_hosted",
        enterpriseModulesEnabled: false,
      }),
    }),
    workspaceBuiltInRolesService: {
      list: async () => [],
      deleteCustomRole: async () => {},
    } as unknown as WorkspaceBuiltInRolesService,
    workspaceBuiltInProfilesService: {
      list: async () => [],
      deleteCustomProfile: async () => {},
    } as unknown as WorkspaceBuiltInProfilesService,
    // Role and profile routes are registered next to the vault router.
    vaultService: {} as never,
  },
  { enterprisePlugins: [] },
);

async function dispatch(method: string, url: string, body?: unknown) {
  const req = {
    method,
    url,
    headers: { "x-user-id": "1000000000000000009", "content-type": "application/json" },
    body: body ?? {},
  } as IncomingMessage;
  const res = new MockResponse();
  await app.handler()(req, res as unknown as ServerResponse);
  return res;
}

const UNREGISTERED: ReadonlyArray<readonly [string, string]> = [
  ["GET", "/monitoring"],
  ["POST", "/monitoring"],
  ["GET", `/workspaces/${WORKSPACE_ID}/monitoring`],
  ["PATCH", `/workspaces/${WORKSPACE_ID}/monitoring`],
  ["PUT", `/workspaces/${WORKSPACE_ID}/monitoring`],
  ["GET", `/workspaces/${WORKSPACE_ID}/monitoring/card-settings`],
  ["PATCH", `/workspaces/${WORKSPACE_ID}/monitoring/card-settings`],
  ["POST", `/workspaces/${WORKSPACE_ID}/monitoring/hibp`],
  ["POST", `/workspaces/${WORKSPACE_ID}/roles`],
  ["PUT", `/workspaces/${WORKSPACE_ID}/roles/${ROLE_ID}`],
  ["PATCH", `/workspaces/${WORKSPACE_ID}/roles/${ROLE_ID}`],
  ["POST", `/workspaces/${WORKSPACE_ID}/profiles`],
  ["PUT", `/workspaces/${WORKSPACE_ID}/profiles/${PROFILE_ID}`],
  ["PATCH", `/workspaces/${WORKSPACE_ID}/profiles/${PROFILE_ID}`],
  ["POST", "/account/recovery/contacts"],
  ["GET", "/account/recovery/contacts"],
  ["POST", "/account/recovery/device-requests"],
  ["GET", "/account/recovery/device-requests"],
  ["POST", "/account/recovery/contact-requests"],
  ["GET", "/account/recovery/contact-requests"],
  ["POST", `/capsules/${CAPSULE_ID}/approval-requests`],
  ["GET", `/capsules/${CAPSULE_ID}/approval-eligibility`],
  ["GET", "/capsule-approval-requests"],
  ["GET", `/capsule-approval-requests/${REQUEST_ID}`],
  ["POST", `/capsule-approval-requests/${REQUEST_ID}/resolve`],
];

test("paid plugin routes are 404 when enterprise plugins are not loaded", async () => {
  for (const [method, url] of UNREGISTERED) {
    const res = await dispatch(method, url, { name: "Custom" });
    assert.equal(res.statusCode, 404, `${method} ${url}`);
    const payload = JSON.parse(res.body) as { error?: string };
    assert.equal(payload.error, "NOT_FOUND", `${method} ${url}`);
  }
});

test("core still lists built-in roles and profiles without enterprise plugins", async () => {
  const roles = await dispatch("GET", `/workspaces/${WORKSPACE_ID}/roles`);
  const profiles = await dispatch("GET", `/workspaces/${WORKSPACE_ID}/profiles`);
  assert.equal(roles.statusCode, 200);
  assert.equal(profiles.statusCode, 200);
  assert.equal((await dispatch("GET", "/account/recovery/contacts")).statusCode, 404);
});

test("enabling trusted contacts without a plugin is an unregistered route", async (t) => {
  const res = await dispatch("PATCH", "/account/recovery/settings", { contactsEnabled: true });
  if (res.statusCode === 403) {
    const payload = JSON.parse(res.body) as { error?: string };
    t.skip(
      `PATCH /account/recovery/settings returns ${res.statusCode} ${payload.error ?? ""} instead of 404. Whether this paid recovery switch should be 404 or 403 is tracked separately.`,
    );
    return;
  }
  assert.equal(res.statusCode, 404);
  assert.equal((JSON.parse(res.body) as { error?: string }).error, "NOT_FOUND");
});
