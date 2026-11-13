import assert from "node:assert/strict";
import test from "node:test";
import { getPlanQuotaLimits, hasPlanFeature } from "@okkey/types";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import {
  registerCapsuleAccessSettingsProvider,
  resetCapsuleAccessSettingsProviderForTests,
} from "../src/capsule/access-settings-provider.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const blob = {
  crypto_version: 2,
  algorithm: "opaque",
  payload: Buffer.from("cipher").toString("base64"),
  meta: {},
};

function serviceForTier(planTier: "FREE" | "ENTERPRISE"): CapsuleService {
  return new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
              plan_tier: planTier,
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
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    // SaaS: honor workspace plan_tier. Self-hosted ignores it and follows loaded modules.
    config: createTestApiConfig({
      deploymentMode: "saas",
      allowedCryptoProfileVersions: [2],
    }),
  });
}

test("FREE and core without a provider deny capsule access settings", async () => {
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "capsuleAccessSettings"), true);
  assert.equal(getPlanQuotaLimits("FREE").maxAdditionalMembers, 3);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxAdditionalMembers, null);
  assert.equal(getPlanQuotaLimits("FREE").maxSharedVaults, 1);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxSharedVaults, null);

  await assert.rejects(
    () =>
      serviceForTier("FREE").createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError &&
      error.code === "FEATURE_NOT_AVAILABLE" &&
      error.statusCode === 403,
  );

  await assert.rejects(
    () =>
      serviceForTier("ENTERPRISE").createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
        passwordAttemptLimit: 3,
      }),
    (error: unknown) => error instanceof Error && error.message === "PLAN_GATE_PASSED",
  );

  await assert.rejects(
    () =>
      serviceForTier("FREE").createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
      }),
    (error: unknown) => error instanceof Error && error.message === "PLAN_GATE_PASSED",
  );
});

test("self_hosted without modules denies capsule access even when plan_tier is ENTERPRISE", async () => {
  const service = new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
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
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
      allowedCryptoProfileVersions: [2],
    }),
  });

  await assert.rejects(
    () =>
      service.createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
      }),
    (error: unknown) =>
      error instanceof CapsuleServiceError &&
      error.code === "FEATURE_NOT_AVAILABLE" &&
      error.statusCode === 403,
  );
});

test("self_hosted modules on and FREE still allow capsule access settings", async () => {
  const service = new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
              plan_tier: "FREE",
              plan_custom_override: false,
              plan_feature_overrides: {},
              capsule_policies: {},
            },
          ];
        }
        if (sql.includes("DELETE FROM capsules")) {
          return [{ id: "1000000000000000009" }];
        }
        return [];
      },
      transaction: async () => {
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
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
      allowedCryptoProfileVersions: [2],
    }),
  });

  await assert.rejects(
    () =>
      service.createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "PLAN_GATE_PASSED");
      assert.ok(!(error instanceof CapsuleServiceError) || error.code !== "PLAN_LICENSE_LAPSED");
      return true;
    },
  );

  await assert.rejects(
    () =>
      service.createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
      }),
    (error: unknown) => error instanceof Error && error.message === "PLAN_GATE_PASSED",
  );

  await service.deleteCapsule("1000000000000000009", "1000000000000000003");
});

test("self_hosted modules on and a paid plan still allow capsule access settings", async () => {
  const service = new CapsuleService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("FROM workspaces")) {
          return [
            {
              exists: true,
              can_access: true,
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
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig({
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
      allowedCryptoProfileVersions: [2],
    }),
  });

  await assert.rejects(
    () =>
      service.createCapsule("1000000000000000001", "1000000000000000003", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
        passwordAttemptLimit: 3,
      }),
    (error: unknown) => error instanceof Error && error.message === "PLAN_GATE_PASSED",
  );
});

test("a registered provider handles access-settings writes", async () => {
  resetCapsuleAccessSettingsProviderForTests();
  registerCapsuleAccessSettingsProvider({
    prepareWrite: async () => {
      throw new Error("PROVIDER_CALLED");
    },
    assertOpen: async () => ({ approvalRequestId: null }),
  });
  try {
    await assert.rejects(
      () =>
        serviceForTier("ENTERPRISE").createCapsule("1000000000000000001", "1000000000000000003", {
          type: "item",
          encryptedPayload: blob,
          password: "capsule-secret",
        }),
      (error: unknown) => error instanceof Error && error.message === "PROVIDER_CALLED",
    );
  } finally {
    resetCapsuleAccessSettingsProviderForTests();
  }
});
