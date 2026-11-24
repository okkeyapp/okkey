import assert from "node:assert/strict";
import test from "node:test";
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

const capsuleRow = {
  id: CAPSULE_ID,
  workspace_id: WORKSPACE_ID,
  creator_id: USER_ID,
  type: "text",
  encrypted_payload: Buffer.from("payload"),
  encrypted_metadata: Buffer.from("meta"),
  owner_key_wrap: Buffer.from("wrap"),
  access_policy: { fileStorageKey: "capsules/existing/file.bin", fileSizeBytes: 4 },
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
  deploymentMode: ApiConfig["deploymentMode"];
  enterpriseModulesEnabled?: boolean;
  planTier?: string;
  planCustomOverride?: boolean;
  planFeatureOverrides?: Record<string, boolean>;
}): { service: CapsuleService; putObjectCalls: number; transactionCalls: number } {
  let putObjectCalls = 0;
  let transactionCalls = 0;
  const service = new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
              plan_tier: input.planTier ?? "FREE",
              plan_custom_override: input.planCustomOverride ?? false,
              plan_feature_overrides: input.planFeatureOverrides ?? {},
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
      putObject: async () => {
        putObjectCalls += 1;
      },
      getObject: async () => null,
      deleteObject: async () => {},
    },
    config: createTestApiConfig({
      deploymentMode: input.deploymentMode,
      enterpriseModulesEnabled: input.enterpriseModulesEnabled ?? false,
      allowedCryptoProfileVersions: [2],
    }),
  });
  return {
    service,
    get putObjectCalls() {
      return putObjectCalls;
    },
    get transactionCalls() {
      return transactionCalls;
    },
  };
}

function isPlanRefusal(error: unknown): boolean {
  return (
    error instanceof CapsuleServiceError &&
    error.code === "FEATURE_NOT_AVAILABLE" &&
    error.statusCode === 403 &&
    error.message === "files in capsules are unavailable on this plan"
  );
}

function passedGate(error: unknown): boolean {
  return error instanceof Error && error.message === "PLAN_GATE_PASSED";
}

test("SaaS FREE refuses capsule file uploads and item attachments", async () => {
  const created = serviceFor({ deploymentMode: "saas", planTier: "FREE" });

  await assert.rejects(
    () =>
      created.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    isPlanRefusal,
  );
  await assert.rejects(
    () =>
      created.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    isPlanRefusal,
  );
  await assert.rejects(
    () =>
      created.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "item",
        encryptedPayload: blob,
        attachmentFilePayloads: { "asset-1": blob },
      }),
    isPlanRefusal,
  );
  await assert.rejects(
    () =>
      created.service.updateCapsule(CAPSULE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    isPlanRefusal,
  );
  await assert.rejects(
    () =>
      created.service.updateCapsule(CAPSULE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
        keepExistingFile: true,
      }),
    isPlanRefusal,
  );

  assert.equal(created.putObjectCalls, 0);
  assert.equal(created.transactionCalls, 0);
});

test("SaaS FREE still creates and updates text capsules without files", async () => {
  const gate = serviceFor({ deploymentMode: "saas", planTier: "FREE" });

  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
        attachmentFilePayloads: {},
      }),
    passedGate,
  );
  await assert.rejects(
    () =>
      gate.service.updateCapsule(CAPSULE_ID, USER_ID, {
        type: "item",
        encryptedPayload: blob,
        keepExistingFile: false,
      }),
    passedGate,
  );
  assert.equal(gate.putObjectCalls, 0);
  assert.equal(gate.transactionCalls, 2);
});

test("SaaS PREMIUM allows capsule files and item attachments", async () => {
  const gate = serviceFor({ deploymentMode: "saas", planTier: "PREMIUM" });

  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    passedGate,
  );
  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "item",
        encryptedPayload: blob,
        attachmentFilePayloads: { "asset-1": blob },
      }),
    passedGate,
  );
  await assert.rejects(
    () =>
      gate.service.updateCapsule(CAPSULE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        keepExistingFile: true,
      }),
    passedGate,
  );
  assert.equal(gate.putObjectCalls, 0);
});

test("self-hosted FREE keeps capsule files when modules are off", async () => {
  const gate = serviceFor({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
    planTier: "FREE",
  });

  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    passedGate,
  );
  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "item",
        encryptedPayload: blob,
        attachmentFilePayloads: { "asset-1": blob },
      }),
    passedGate,
  );
  assert.equal(gate.putObjectCalls, 0);
});

test("custom override can turn capsule files off on PREMIUM", async () => {
  const gate = serviceFor({
    deploymentMode: "saas",
    planTier: "PREMIUM",
    planCustomOverride: true,
    planFeatureOverrides: { filesInCapsules: false },
  });

  await assert.rejects(
    () =>
      gate.service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "file",
        encryptedPayload: blob,
        filePayload: blob,
      }),
    isPlanRefusal,
  );
  assert.equal(gate.transactionCalls, 0);
  assert.equal(gate.putObjectCalls, 0);
});
