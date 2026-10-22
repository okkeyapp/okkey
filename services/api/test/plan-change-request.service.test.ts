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
  sentAt?: string | null;
  memberCount?: number;
  publicAppBaseUrl?: string;
  markSent?: () => Promise<boolean>;
}) {
  const sent: unknown[] = [];
  let markCalls = 0;
  const service = new PlanChangeRequestService({
    salesEmail: overrides?.salesEmail ?? "sales@example.com",
    deploymentMode: "self_hosted",
    publicAppBaseUrl: overrides?.publicAppBaseUrl ?? "https://vault.example",
    db: {
      query: async (sql: string) => {
        if (sql.includes("owner_id")) {
          return [{ owner_id: "user_1" }];
        }
        throw new Error(`unexpected query: ${sql}`);
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
        planChangeRequestSentAt: overrides?.sentAt ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      countMembers: async () => overrides?.memberCount ?? 4,
      markPlanChangeRequestSent: async () => {
        markCalls += 1;
        if (overrides?.markSent) {
          return overrides.markSent();
        }
        return true;
      },
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

  return { service, sent, getMarkCalls: () => markCalls };
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

test("PlanChangeRequestService rejects when already submitted", async () => {
  const { service, sent } = makeService({
    sentAt: "2026-10-22T10:00:00.000Z",
  });
  await assert.rejects(
    () =>
      service.submit({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        requestedPlanTier: "ENTERPRISE",
        contactEmail: "a@b.co",
        locale: "ru",
        region: null,
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "ALREADY_SUBMITTED",
  );
  assert.equal(sent.length, 0);
});

test("PlanChangeRequestService sends auto fields and marks sent", async () => {
  const { service, sent, getMarkCalls } = makeService({
    memberCount: 7,
    publicAppBaseUrl: "https://okkey.corp/",
  });
  const result = await service.submit({
    workspaceId: "ws_1",
    actorUserId: "user_1",
    requestedPlanTier: "ENTERPRISE",
    contactEmail: "reply@corp.example",
    locale: "en",
    region: "US",
  });
  assert.deepEqual(result, { submitted: true });
  assert.equal(sent.length, 1);
  const payload = sent[0] as {
    to: string;
    variables: Record<string, unknown>;
  };
  assert.equal(payload.to, "sales@example.com");
  assert.equal(payload.variables.workspaceName, "Demo");
  assert.equal(payload.variables.workspaceUrl, "https://okkey.corp");
  assert.equal(payload.variables.workspaceMemberCount, 7);
  assert.equal(payload.variables.contactEmail, "reply@corp.example");
  assert.equal(payload.variables.accountEmail, "owner@example.com");
  assert.equal(payload.variables.region, "RU");
  assert.equal(payload.variables.locale, "en");
  assert.equal(getMarkCalls(), 1);
});

test("PlanChangeRequestService getStatus reports submitted flag", async () => {
  const pending = makeService({ sentAt: null });
  assert.deepEqual(await pending.service.getStatus({ workspaceId: "ws_1", actorUserId: "user_1" }), {
    submitted: false,
    sentAt: null,
  });
  const done = makeService({ sentAt: "2026-10-22T12:00:00.000Z" });
  assert.deepEqual(await done.service.getStatus({ workspaceId: "ws_1", actorUserId: "user_1" }), {
    submitted: true,
    sentAt: "2026-10-22T12:00:00.000Z",
  });
});

test("PlanChangeRequestService does not mark sent when email fails", async () => {
  const { service, getMarkCalls } = makeService({
    send: async () => {
      throw new Error("smtp down");
    },
  });
  await assert.rejects(
    () =>
      service.submit({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        requestedPlanTier: "ENTERPRISE",
        contactEmail: "a@b.co",
        locale: "ru",
        region: "RU",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "EMAIL_SEND_FAILED",
  );
  assert.equal(getMarkCalls(), 0);
});
