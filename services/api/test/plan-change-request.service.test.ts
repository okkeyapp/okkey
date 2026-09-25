import assert from "node:assert/strict";
import test from "node:test";

import {
  PlanChangeRequestService,
  PlanChangeRequestServiceError,
} from "../src/plan-change-request/service.ts";

function makeService(overrides?: {
  planTier?: string;
  send?: (input: unknown) => Promise<void>;
  salesEmail?: string;
  putBilling?: number;
}) {
  const sent: unknown[] = [];
  const service = new PlanChangeRequestService({
    salesEmail: overrides?.salesEmail ?? "sales@example.com",
    db: {
      query: async () => {
        // resolveWorkspacePermissions path is stubbed via assertWorkspacePermission → needs real query
        throw new Error("unexpected query");
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: "ws_1",
        name: "Demo",
        ownerId: "user_1",
        planTier: overrides?.planTier ?? "FREE",
        deletedItemsRetentionDays: 30,
        allowedFileExtensions: [],
        maxFileSizeMb: 25,
        filesInItemsEnabled: false,
        capsulePolicies: {} as never,
        monitoringCardSettings: {} as never,
        tileColor: null,
        logoVaultId: null,
        logoAttachmentId: null,
        planCustomOverride: false,
        planFeatureOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    },
    users: {
      loadAccountProfile: async () => ({
        email: "owner@example.com",
        firstName: "A",
        lastName: "B",
        locale: "ru",
        billingRegion: "RU",
        vaultIdleLockSeconds: 900,
        masterPasswordChangedAt: new Date().toISOString(),
      }),
    },
    emailTemplates: {
      sendPlanChangeRequest: async (input) => {
        sent.push(input);
        await overrides?.send?.(input);
      },
    },
  });

  // Monkey-patch permission check by replacing db.query used inside assertWorkspacePermission —
  // instead wrap submit via subclassing is hard; stub permission through a local spy service.
  return { service, sent };
}

test("PlanChangeRequestService rejects missing sales email", async () => {
  const { service } = makeService({ salesEmail: "  " });
  await assert.rejects(
    () =>
      service.submit({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        requestedPlanTier: "PREMIUM",
        contactEmail: "a@b.co",
        locale: "ru",
        region: "RU",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("PlanChangeRequestService rejects invalid tier and email", async () => {
  const { service } = makeService();
  await assert.rejects(
    () =>
      service.submit({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        requestedPlanTier: "PREMIUM",
        contactEmail: "not-an-email",
        locale: "ru",
        region: "RU",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    () =>
      service.submit({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        requestedPlanTier: "GOLD",
        contactEmail: "a@b.co",
        locale: "ru",
        region: "RU",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "INVALID_REQUEST",
  );
});
