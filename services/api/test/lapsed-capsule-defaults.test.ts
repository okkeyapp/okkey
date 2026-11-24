/**
 * Capsule default writes on self-host follow loaded modules, not `plan_tier`.
 * GET stays available. SaaS still follows `plan_tier` and does not lapse from it.
 */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { DEFAULT_WORKSPACE_CAPSULE_POLICIES } from "@okkey/types";
import { CapsuleDefaultsService } from "../src/capsule-defaults/service.ts";
import { createWorkspaceCapsuleDefaultsRoute } from "../src/routes/workspace-capsule-defaults.ts";
import { WorkspaceSettingsService } from "../src/workspace-settings/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000100";
const USER_ID = "1000000000000000001";

const settings = {
  viewsEnabled: false,
  maxViews: 1,
  viewLimitAction: "deactivate" as const,
  timeEnabled: false,
  activatePreset: "now" as const,
  deactivatePreset: "never" as const,
  deletePreset: "never" as const,
  accessEnabled: false,
  passwordEnabled: false,
  attemptLimit: 3,
  approvalRequired: false,
};

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function workspace(planTier: string) {
  return {
    id: WORKSPACE_ID,
    name: "On-prem",
    ownerId: USER_ID,
    planTier,
    planCustomOverride: false,
    planFeatureOverrides: {},
    createdAt: "",
    updatedAt: "",
  };
}

function defaultsService(planTier: string, enterpriseModulesEnabled: boolean, deploymentMode: "self_hosted" | "saas" = "self_hosted") {
  let writes = 0;
  const service = new CapsuleDefaultsService({
    defaults: {
      list: async () => [],
      upsert: async () => {
        writes += 1;
        return {
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          capsuleType: "text" as const,
          settings,
          updatedAt: "",
        };
      },
    },
    workspaces: {
      findById: async () => workspace(planTier) as never,
      hasAccess: async () => true,
    },
    config: createTestApiConfig({ deploymentMode, enterpriseModulesEnabled }),
  });
  return { service, writes: () => writes };
}

function routeFor(planTier: string, enterpriseModulesEnabled: boolean, deploymentMode: "self_hosted" | "saas" = "self_hosted") {
  const harness = defaultsService(planTier, enterpriseModulesEnabled, deploymentMode);
  const handler = createWorkspaceCapsuleDefaultsRoute(harness.service, async () => USER_ID);
  return { handler, writes: harness.writes };
}

async function dispatch(
  handler: ReturnType<typeof createWorkspaceCapsuleDefaultsRoute>,
  method: string,
  body?: unknown,
) {
  const req = {
    method,
    url: `/workspaces/${WORKSPACE_ID}/capsule-defaults`,
    headers: { "x-user-id": USER_ID, "content-type": "application/json" },
    body,
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    requestId: "req-1",
    req,
    res: res as unknown as ServerResponse,
    params: { workspaceId: WORKSPACE_ID },
  });
  return res;
}

test("EE + FREE saves PUT capsule-defaults and still lists them", async () => {
  const { handler, writes } = routeFor("FREE", true);
  const put = await dispatch(handler, "PUT", { settings });
  const payload = JSON.parse(put.body) as { error?: string };
  assert.equal(put.statusCode, 200);
  assert.notEqual(payload.error, "PLAN_LICENSE_LAPSED");
  assert.equal(writes(), 3);

  const get = await dispatch(handler, "GET");
  assert.equal(get.statusCode, 200);
  assert.deepEqual(JSON.parse(get.body), { defaults: [] });
});

test("EE + paid still saves capsule-defaults", async () => {
  const { handler, writes } = routeFor("ENTERPRISE", true);
  const put = await dispatch(handler, "PUT", { settings });
  assert.equal(put.statusCode, 200);
  assert.equal(writes(), 3);
});

test("self-hosted without modules still saves capsule-defaults", async () => {
  const { handler, writes } = routeFor("FREE", false);
  const put = await dispatch(handler, "PUT", { settings });
  assert.equal(put.statusCode, 200);
  assert.equal(writes(), 3);
});

test("SaaS FREE still saves capsule-defaults", async () => {
  const { handler, writes } = routeFor("FREE", false, "saas");
  const put = await dispatch(handler, "PUT", { settings });
  assert.equal(put.statusCode, 200);
  assert.equal(writes(), 3);
});

test("EE + FREE saves a capsule policy change", async () => {
  let saved = false;
  const current = {
    ...workspace("FREE"),
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: [],
    maxFileSizeMb: 25,
    filesInItemsEnabled: true,
    capsulePolicies: DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    tileColor: null,
    logoVaultId: null,
    logoAttachmentId: null,
    logoKeyVersion: null,
    logoUpdatedAt: null,
    clientSettingsKeyVersion: null,
    clientSettingsCiphertext: null,
    planChangeRequestSentAt: null,
  };
  const service = new WorkspaceSettingsService({
    workspaces: {
      findById: async () => current as never,
      hasAccess: async () => true,
      updateGeneralSettings: async (_workspaceId: string, update: { capsulePolicies?: typeof current.capsulePolicies }) => {
        saved = true;
        return { ...current, ...update } as never;
      },
      deleteOwnedWorkspace: async () => false,
    },
    vaults: { findById: async () => null },
    db: { query: async () => [{ owner_id: USER_ID }] } as never,
    config: createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
    }),
  });

  const updated = await service.updateSettings(WORKSPACE_ID, USER_ID, {
    capsulePolicies: { ...DEFAULT_WORKSPACE_CAPSULE_POLICIES, allowMode: "none" },
  });
  assert.equal(saved, true);
  assert.equal(updated.capsulePolicies.allowMode, "none");
});
