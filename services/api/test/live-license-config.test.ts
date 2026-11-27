/**
 * TSK-436: services must read license / deployment flags from the shared config
 * object after construction. A spread snapshot at construction time leaves
 * enterpriseLicenseVerified / enterpriseLicenseLapsed / hostedDeploymentConfirmed
 * stuck at their pre-plugin values (usually false / undefined).
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
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000001";
const USER_ID = "1000000000000000003";

const blob = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: Buffer.from("cipher").toString("base64"),
  meta: {},
};

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

function capsuleServiceFor(config: ReturnType<typeof createTestApiConfig>): CapsuleService {
  return new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
              // Self-hosted ignores plan_tier; keep ENTERPRISE to prove it is not the gate.
              plan_tier: "ENTERPRISE",
              plan_custom_override: false,
              plan_feature_overrides: {},
              capsule_policies: {},
            },
          ];
        }
        return [];
      },
      transaction: async () => {
        throw new Error("PLAN_GATE_PASSED");
      },
    },
    redis: {
      setIfNotExistsWithTtl: async () => true,
      incr: async () => 1,
      ttl: async () => 60,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
      deleteObject: async () => {},
    },
    config,
  });
}

function isFeatureUnavailable(error: unknown): boolean {
  return (
    error instanceof CapsuleServiceError &&
    error.code === "FEATURE_NOT_AVAILABLE" &&
    error.statusCode === 403
  );
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

test("CapsuleService: license verified after construction unlocks capsule access settings", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  registerStubAccessSettingsProvider();
  try {
    const config = createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
      enterpriseLicenseVerified: false,
      enterpriseLicenseLapsed: false,
    });
    const service = capsuleServiceFor(config);

    await assert.rejects(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          approvalRequired: true,
        }),
      isFeatureUnavailable,
    );

    // Plugin confirms a verified license on the shared config after services start.
    config.enterpriseLicenseVerified = true;

    await assert.rejects(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          approvalRequired: true,
        }),
      passedGate,
    );
  } finally {
    resetCapsuleAccessSettingsProviderForTests();
  }
});

test("CapsuleService: no verified license keeps capsule access settings at 403", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: true,
    enterpriseLicenseVerified: false,
    enterpriseLicenseLapsed: false,
  });
  const service = capsuleServiceFor(config);

  await assert.rejects(
    () =>
      service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
        password: "capsule-secret",
      }),
    isFeatureUnavailable,
  );
});

test("CapsuleService: license lapsed after start soft-locks capsule access settings again", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  registerStubAccessSettingsProvider();
  try {
    const config = createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
      enterpriseLicenseVerified: true,
      enterpriseLicenseLapsed: false,
    });
    const service = capsuleServiceFor(config);

    await assert.rejects(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          approvalRequired: true,
        }),
      passedGate,
    );

    // Plugin reports lapse on the shared config after the service was constructed.
    config.enterpriseLicenseVerified = false;
    config.enterpriseLicenseLapsed = true;

    await assert.rejects(
      () =>
        service.createCapsule(WORKSPACE_ID, USER_ID, {
          type: "text",
          encryptedPayload: blob,
          approvalRequired: true,
        }),
      isLicenseLapsed,
    );
  } finally {
    resetCapsuleAccessSettingsProviderForTests();
  }
});

test("CapsuleService: self-hosted plan_tier ENTERPRISE without license still returns 403", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
    enterpriseLicenseVerified: false,
  });
  const service = capsuleServiceFor(config);

  await assert.rejects(
    () =>
      service.createCapsule(WORKSPACE_ID, USER_ID, {
        type: "text",
        encryptedPayload: blob,
        approvalRequired: true,
      }),
    isFeatureUnavailable,
  );
});
