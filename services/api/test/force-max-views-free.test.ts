/**
 * OKKEYAPP-230: Core view limit (`forceMaxViews`) on FREE.
 * SaaS FREE and self-hosted without enterprise modules keep the limit,
 * while password, expiry, members-only, and approval stay off.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  type WorkspaceCapsulePolicies,
} from "@okkey/types";
import { resetCapsuleAccessSettingsProviderForTests } from "../src/capsule/access-settings-provider.ts";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import type { ApiConfig } from "../src/config.ts";
import {
  WorkspaceSettingsService,
} from "../src/workspace-settings/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000001";
const USER_ID = "1000000000000000003";
const CAPSULE_ID = "1000000000000000009";
const FORCED_VIEWS = 4;

const blob = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: Buffer.from("cipher").toString("base64"),
  meta: {},
};

type Variant = {
  label: string;
  deploymentMode: ApiConfig["deploymentMode"];
  planTier: string;
};

const VARIANTS: readonly Variant[] = [
  { label: "SaaS FREE", deploymentMode: "saas", planTier: "FREE" },
  {
    label: "self-hosted without enterprise modules",
    deploymentMode: "self_hosted",
    planTier: "ENTERPRISE",
  },
];

function policies(overrides: Partial<WorkspaceCapsulePolicies> = {}): WorkspaceCapsulePolicies {
  return {
    ...DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    allowMemberIds: [],
    allowedCapsuleTypes: [...DEFAULT_WORKSPACE_CAPSULE_POLICIES.allowedCapsuleTypes],
    ...overrides,
  };
}

function accessSettingsPatch(): WorkspaceCapsulePolicies {
  return policies({
    forceMaxViews: FORCED_VIEWS,
    requireTimeDeactivation: true,
    requireAccess: true,
    accessAudience: "workspace_members_only",
    requirePassword: true,
    passwordAttemptLimit: 5,
    requireApproval: true,
  });
}

for (const variant of VARIANTS) {
  test(`${variant.label}: workspace settings persist forceMaxViews and keep access settings off`, async () => {
    let saved: WorkspaceCapsulePolicies | undefined;
    const stored = policies({ requirePassword: false, requireApproval: false });
    const service = new WorkspaceSettingsService({
      workspaces: {
        findById: async () =>
          ({
            id: WORKSPACE_ID,
            name: "Acme",
            ownerId: USER_ID,
            planTier: variant.planTier,
            planCustomOverride: false,
            planFeatureOverrides: {},
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
            maxFileSizeMb: 25,
            filesInItemsEnabled: true,
            capsulePolicies: stored,
            tileColor: null,
            logoVaultId: null,
            logoAttachmentId: null,
            logoKeyVersion: null,
            logoUpdatedAt: null,
            clientSettingsKeyVersion: null,
            clientSettingsCiphertext: null,
            planChangeRequestSentAt: null,
            createdAt: "",
            updatedAt: "",
          }) as never,
        hasAccess: async () => true,
        updateGeneralSettings: async (_id, update) => {
          saved = update.capsulePolicies;
          return {
            id: WORKSPACE_ID,
            name: "Acme",
            ownerId: USER_ID,
            planTier: variant.planTier,
            planCustomOverride: false,
            planFeatureOverrides: {},
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
            maxFileSizeMb: 25,
            filesInItemsEnabled: true,
            capsulePolicies: update.capsulePolicies ?? stored,
            tileColor: null,
            logoVaultId: null,
            logoAttachmentId: null,
            logoKeyVersion: null,
            logoUpdatedAt: null,
            clientSettingsKeyVersion: null,
            clientSettingsCiphertext: null,
            planChangeRequestSentAt: null,
            createdAt: "",
            updatedAt: "",
          } as never;
        },
        deleteOwnedWorkspace: async () => false,
      },
      vaults: { findById: async () => null },
      db: { query: async () => [{ owner_id: USER_ID }] } as never,
      config: createTestApiConfig({
        deploymentMode: variant.deploymentMode,
        enterpriseModulesEnabled: false,
      }),
    });

    const updated = await service.updateSettings(WORKSPACE_ID, USER_ID, {
      capsulePolicies: accessSettingsPatch(),
    });

    assert.ok(saved);
    assert.equal(saved.forceMaxViews, FORCED_VIEWS);
    assert.equal(updated.capsulePolicies.forceMaxViews, FORCED_VIEWS);
    assert.equal(saved.requirePassword, false);
    assert.equal(saved.requireApproval, false);
    assert.equal(saved.requireTimeDeactivation, false);
    assert.equal(saved.requireAccess, false);
    assert.equal(saved.accessAudience, "all_users");
    assert.equal(saved.passwordAttemptLimit, 0);
  });

  test(`${variant.label}: capsule create and update honor forceMaxViews and reject access settings`, async () => {
    resetCapsuleAccessSettingsProviderForTests();
    const storedPolicies = {
      allow_mode: "all",
      allow_member_ids: [],
      allowed_capsule_types: ["text", "file", "item"],
      force_max_views: FORCED_VIEWS,
      require_time_deactivation: true,
      require_access: true,
      access_audience: "workspace_members_only",
      require_password: true,
      password_attempt_limit: 5,
      require_approval: true,
    };
    let transactions = 0;
    const existing = capsuleRow({ view_limit: FORCED_VIEWS });
    const service = new CapsuleService({
      db: {
        query: async (sql: string) => {
          if (sql.includes("FROM workspaces")) {
            return [
              {
                exists: true,
                can_access: true,
                plan_tier: variant.planTier,
                plan_custom_override: false,
                plan_feature_overrides: {},
                capsule_policies: storedPolicies,
              },
            ];
          }
          if (sql.includes("FROM capsules")) {
            return [existing];
          }
          throw new Error(`unexpected query: ${sql}`);
        },
        transaction: async <T>(fn: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }) => Promise<T>) => {
          transactions += 1;
          return fn({
            query: async (sql: string, params?: unknown[]) => {
              if (sql.includes("INSERT INTO capsules")) {
                return [rowFromWrite(params ?? [], "insert")];
              }
              if (sql.includes("UPDATE capsules")) {
                return [rowFromWrite(params ?? [], "update")];
              }
              return [];
            },
          });
        },
      },
      redis: { incr: async () => 1, expire: async () => true },
      objectStorage: {
        putObject: async () => {},
        getObject: async () => null,
        deleteObject: async () => {},
      },
      config: createTestApiConfig({
        deploymentMode: variant.deploymentMode,
        enterpriseModulesEnabled: false,
        allowedCryptoProfileVersions: [2],
      }),
    });

    const created = await service.createCapsule(WORKSPACE_ID, USER_ID, {
      type: "text",
      encryptedPayload: blob,
      maxViews: FORCED_VIEWS,
    });
    assert.equal(created.maxViews, FORCED_VIEWS);
    assert.equal(created.passwordRequired, false);
    assert.equal(created.approvalRequired, false);
    assert.equal(created.deactivateAt, null);
    assert.equal(created.recipientRestricted, false);

    const updated = await service.updateCapsule(CAPSULE_ID, USER_ID, {
      type: "text",
      encryptedPayload: blob,
      maxViews: FORCED_VIEWS,
    });
    assert.equal(updated.maxViews, FORCED_VIEWS);

    await assertRejected(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          maxViews: FORCED_VIEWS + 1,
        }),
      "CAPSULE_BAD_REQUEST",
      400,
    );
    await assertRejected(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
        }),
      "CAPSULE_BAD_REQUEST",
      400,
    );
    await assertRejected(
      () =>
        service.updateCapsule(CAPSULE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          maxViews: 1,
        }),
      "CAPSULE_BAD_REQUEST",
      400,
    );

    const transactionsBeforeAccess = transactions;
    for (const extra of [
      { password: "capsule-secret" },
      { expiresAt: "2030-01-01T00:00:00.000Z" },
      { deactivateAt: "2030-01-01T00:00:00.000Z" },
      { allowedRecipientEmails: ["member@example.com"] },
      { approvalRequired: true },
    ] as const) {
      await assertRejected(
        () =>
          service.createCapsule(WORKSPACE_ID, USER_ID, {
            type: "text",
            encryptedPayload: blob,
            maxViews: FORCED_VIEWS,
            ...extra,
          }),
        "FEATURE_NOT_AVAILABLE",
        403,
      );
      await assertRejected(
        () =>
          service.updateCapsule(CAPSULE_ID, USER_ID, {
            type: "text",
            encryptedPayload: blob,
            maxViews: FORCED_VIEWS,
            ...extra,
          }),
        "FEATURE_NOT_AVAILABLE",
        403,
      );
    }
    assert.equal(transactions, transactionsBeforeAccess);
  });
}

async function assertRejected(
  run: () => Promise<unknown>,
  code: string,
  statusCode: number,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof CapsuleServiceError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

function capsuleRow(overrides: { view_limit: number | null }) {
  return {
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
    view_limit: overrides.view_limit,
    view_count: 0,
    view_limit_action: "deactivate",
    password_attempt_limit: null,
    approval_required: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function rowFromWrite(params: unknown[], mode: "insert" | "update") {
  const viewLimit = mode === "insert" ? params[12] : params[11];
  const approval = mode === "insert" ? params[15] : params[14];
  return {
    ...capsuleRow({ view_limit: (viewLimit as number | null) ?? null }),
    id: mode === "insert" ? String(params[0]) : CAPSULE_ID,
    access_policy: typeof params[mode === "insert" ? 7 : 6] === "string"
      ? JSON.parse(String(params[mode === "insert" ? 7 : 6]))
      : {},
    approval_required: approval === true,
    activate_at: null,
    deactivate_at: null,
    delete_at: null,
    expires_at: null,
  };
}
