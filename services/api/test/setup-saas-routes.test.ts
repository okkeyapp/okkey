import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SetupService } from "../src/setup/service.ts";

const routesSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/setup/routes.ts"),
  "utf8",
);

test("setup routes hide wizard endpoints on SaaS with NOT_FOUND", () => {
  assert.match(routesSource, /function hideInSaas/);
  assert.match(routesSource, /deploymentMode === "saas"/);
  assert.match(routesSource, /NOT_FOUND/);
  // Status stays public so clients learn setup is not required; other routes call hideInSaas.
  assert.match(routesSource, /GET", "\/public\/setup\/status"/);
  assert.match(routesSource, /if \(hideInSaas\(config, ctx\)\)[\s\S]*POST", "\/public\/setup\/verify"/);
});

test("SetupService getStatus is never required on SaaS", async () => {
  const redis = {
    async setWithTtl() {},
    async setIfNotExistsWithTtl() {
      return true;
    },
    async get() {
      return null;
    },
    async del() {
      return 0;
    },
    async incr() {
      return 1;
    },
    async expire() {
      return true;
    },
  };
  const service = new SetupService({
    redis,
    users: {
      hasAnyUsers: async () => false,
      findByEmail: async () => null,
    },
    instanceSettings: {
      async read() {
        return {
          registrationMode: "open",
          setupCompletedAt: null,
          updatedAt: new Date().toISOString(),
        };
      },
      async writeRegistrationMode() {
        throw new Error("unused");
      },
      async markSetupCompleted() {
        throw new Error("unused");
      },
    },
    mailSettings: {
      getPublicSettings: async () => {
        throw new Error("unused");
      },
      updateForSetup: async () => {
        throw new Error("unused");
      },
      sendTestEmailForSetup: async () => {
        throw new Error("unused");
      },
      skipMailForSetup: async () => {
        throw new Error("unused");
      },
      updatePublicAppUrlPreservingVerification: async () => {
        throw new Error("unused");
      },
    },
    authService: {
      claimEmptyCatalogBootstrap: async () => false,
      createRegistrationAuthStateForTrustedEmail: async () => "",
    },
    sessionService: {
      createSession: async () => {
        throw new Error("unused");
      },
    },
    workspaceSettings: {
      updateSettings: async () => {
        throw new Error("unused");
      },
    },
    workspaceMembers: {
      createInvitations: async () => ({ created: [], deliveryStatus: "pending" as const }),
      hasPendingInvitationForEmail: async () => false,
      deliverPendingInvitationEmails: async () => ({ delivered: 0 }),
    },
    postgres: {
      async query() {
        return [];
      },
      async transaction(fn) {
        return fn({ query: async () => [] });
      },
    },
    config: {
      deploymentMode: "saas",
      nodeEnv: "test",
      registrationAuthStateTtlSeconds: 3600,
      sessionTtlSeconds: 3600,
    },
  });

  assert.deepEqual(await service.getStatus(), { required: false, deploymentMode: "saas" });
  await assert.rejects(
    () => service.verifyCode("aaaa-bbbb-cccc-dddd"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SETUP_NOT_AVAILABLE",
  );
});
