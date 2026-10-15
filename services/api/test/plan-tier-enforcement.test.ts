import assert from "node:assert/strict";
import test from "node:test";
import { getPlanQuotaLimits, hasPlanFeature } from "@okkey/types";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
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
    // SaaS: honor workspace plan_tier (self_hosted ignores tier and uses modules).
    config: createTestApiConfig({
      deploymentMode: "saas",
      allowedCryptoProfileVersions: [2],
    }),
  });
}

test("FREE denies capsule access settings and ENTERPRISE allows them", async () => {
  assert.equal(hasPlanFeature("FREE", "capsuleAccessSettings"), false);
  assert.equal(hasPlanFeature("ENTERPRISE", "capsuleAccessSettings"), true);
  assert.equal(getPlanQuotaLimits("FREE").maxAdditionalMembers, 0);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxAdditionalMembers, null);
  assert.equal(getPlanQuotaLimits("FREE").maxSharedVaults, 0);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxSharedVaults, null);

  await assert.rejects(
    () =>
      serviceForTier("FREE").createCapsule("w1", "u1", {
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
      serviceForTier("ENTERPRISE").createCapsule("w1", "u1", {
        type: "item",
        encryptedPayload: blob,
        password: "capsule-secret",
      }),
    (error: unknown) => error instanceof Error && error.message === "PLAN_GATE_PASSED",
  );

  await assert.rejects(
    () =>
      serviceForTier("FREE").createCapsule("w1", "u1", {
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
      service.createCapsule("w1", "u1", {
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
