/**
 * Soft-lock after a self-hosted enterprise license lapses: paid capsule access
 * settings writes return HTTP 402 PLAN_LICENSE_LAPSED and do not persist.
 * Free capsule create/update without those fields stays allowed.
 *
 * Covers CapsuleService.resolveAccessWrite (PLAN_LICENSE_LAPSED branch).
 * Capsule defaults / workspace policy edits are covered elsewhere
 * (lapsed-capsule-defaults.test.ts). File uploads are covered by
 * capsule-files-plan.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_LICENSE_LAPSED,
  PLAN_LICENSE_LAPSED_STATUS,
} from "@okkey/types";
import {
  registerCapsuleAccessSettingsProvider,
  resetCapsuleAccessSettingsProviderForTests,
} from "../src/capsule/access-settings-provider.ts";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000001";
const USER_ID = "1000000000000000003";
const CAPSULE_ID = "1000000000000000009";

const blob = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: Buffer.from("cipher").toString("base64"),
  meta: {},
};

/** Paid access-setting fields gated by `capsuleAccessSettings` / requestsCapsuleAccessSettings. */
const PAID_ACCESS_FIELDS = [
  { password: "capsule-secret" },
  { expiresAt: "2030-01-01T00:00:00.000Z" },
  { activateAt: "2030-01-01T00:00:00.000Z" },
  { deactivateAt: "2030-01-01T00:00:00.000Z" },
  { deleteAt: "2030-01-01T00:00:00.000Z" },
  { passwordAttemptLimit: 3 },
  { allowedRecipientEmails: ["member@example.com"] },
  { approvalRequired: true },
  { maxViews: 5 },
  { viewLimitAction: "delete" as const },
] as const;

const capsuleRow = {
  id: CAPSULE_ID,
  workspace_id: WORKSPACE_ID,
  creator_id: USER_ID,
  type: "text",
  encrypted_payload: Buffer.from("payload"),
  encrypted_metadata: Buffer.from("meta"),
  owner_key_wrap: Buffer.from("wrap"),
  access_policy: {},
  expires_at: null,
  state: "active",
  activate_at: null,
  deactivate_at: null,
  delete_at: null,
  view_limit: null,
  view_count: 0,
  view_limit_action: "deactivate",
  password_attempt_limit: null,
  approval_required: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function serviceFor(input: {
  enterpriseLicenseLapsed?: boolean;
  enterpriseModulesEnabled?: boolean;
  deploymentMode?: ApiConfig["deploymentMode"];
  planTier?: string;
}): { service: CapsuleService; get transactionCalls(): number } {
  let transactionCalls = 0;
  const service = new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
              plan_tier: input.planTier ?? "ENTERPRISE",
              plan_custom_override: false,
              plan_feature_overrides: {},
              capsule_policies: {},
            },
          ];
        }
        if (sql.includes("FROM capsules")) {
          return [capsuleRow];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
      transaction: async () => {
        transactionCalls += 1;
        throw new Error("PLAN_GATE_PASSED");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
      deleteObject: async () => {},
    },
    config: createTestApiConfig({
      deploymentMode: input.deploymentMode ?? "self_hosted",
      enterpriseModulesEnabled: input.enterpriseModulesEnabled ?? true,
      enterpriseLicenseLapsed: input.enterpriseLicenseLapsed ?? false,
      allowedCryptoProfileVersions: [2],
    }),
  });
  return {
    service,
    get transactionCalls() {
      return transactionCalls;
    },
  };
}

function isLicenseLapsed(error: unknown): boolean {
  return (
    error instanceof CapsuleServiceError &&
    error.code === PLAN_LICENSE_LAPSED &&
    error.statusCode === PLAN_LICENSE_LAPSED_STATUS
  );
}

function passedGate(error: unknown): boolean {
  return error instanceof Error && error.message === "PLAN_GATE_PASSED";
}

function fieldLabel(field: (typeof PAID_ACCESS_FIELDS)[number]): string {
  return Object.keys(field)[0] ?? "unknown";
}

/** Stub EE access-settings plugin so active-license writes reach persistence. */
function registerStubAccessSettingsProvider(): void {
  registerCapsuleAccessSettingsProvider({
    prepareWrite: async ({ input }) => ({
      accessPolicy: {},
      activateAt: input.activateAt ?? null,
      deactivateAt: input.deactivateAt ?? input.expiresAt ?? null,
      deleteAt: input.deleteAt ?? null,
      maxViews: input.maxViews ?? null,
      viewLimitAction: input.viewLimitAction === "delete" ? "delete" : "deactivate",
      passwordAttemptLimit: input.passwordAttemptLimit ?? null,
      approvalRequired: input.approvalRequired === true,
    }),
    assertOpen: async () => ({ approvalRequestId: null }),
  });
}

test("lapsed license rejects create and update for each paid capsule access setting", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  const harness = serviceFor({ enterpriseLicenseLapsed: true });

  for (const field of PAID_ACCESS_FIELDS) {
    await assert.rejects(
      () =>
        harness.service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          ...field,
        }),
      isLicenseLapsed,
      `create with ${fieldLabel(field)}`,
    );
    await assert.rejects(
      () =>
        harness.service.updateCapsule(CAPSULE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          ...field,
        }),
      isLicenseLapsed,
      `update with ${fieldLabel(field)}`,
    );
  }

  assert.equal(harness.transactionCalls, 0);
});

test("active self-hosted license still allows paid capsule access settings", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  registerStubAccessSettingsProvider();
  try {
    const harness = serviceFor({ enterpriseLicenseLapsed: false });

    for (const field of PAID_ACCESS_FIELDS) {
      await assert.rejects(
        () =>
          harness.service.createCapsule(WORKSPACE_ID, USER_ID, {
            type: "text",
            encryptedPayload: blob,
            ...field,
          }),
        passedGate,
        `create with ${fieldLabel(field)}`,
      );
      await assert.rejects(
        () =>
          harness.service.updateCapsule(CAPSULE_ID, USER_ID, {
            type: "text",
            encryptedPayload: blob,
            ...field,
          }),
        passedGate,
        `update with ${fieldLabel(field)}`,
      );
    }

    assert.equal(harness.transactionCalls, PAID_ACCESS_FIELDS.length * 2);
  } finally {
    resetCapsuleAccessSettingsProviderForTests();
  }
});

test("lapsed license still allows capsule create and update without paid access settings", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  const harness = serviceFor({ enterpriseLicenseLapsed: true });

  await assert.rejects(
    () =>
      harness.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
      }),
    passedGate,
  );
  await assert.rejects(
    () =>
      harness.service.updateCapsule(CAPSULE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
      }),
    passedGate,
  );

  assert.equal(harness.transactionCalls, 2);
});
