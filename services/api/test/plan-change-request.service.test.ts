import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_CHANGE_REQUEST_DAILY_LIMIT,
  PlanChangeRequestService,
  PlanChangeRequestServiceError,
  planChangeRequestDailyRedisKey,
  secondsUntilNextUtcMidnight,
} from "../src/plan-change-request/service.ts";
import type { DeploymentMode } from "../src/config.ts";

function makeMemoryRedis() {
  const counts = new Map<string, number>();
  const expires = new Map<string, number>();
  return {
    counts,
    expires,
    redis: {
      incr: async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async (key: string, seconds: number) => {
        expires.set(key, seconds);
        return true;
      },
    },
  };
}

function makeService(overrides?: {
  planTier?: string;
  send?: (input: unknown) => Promise<void>;
  salesEmail?: string;
  salesEmailDeliverable?: boolean;
  sentAt?: string | null;
  memberCount?: number;
  publicAppBaseUrl?: string;
  deploymentMode?: DeploymentMode;
  markSent?: () => Promise<boolean>;
  redis?: ReturnType<typeof makeMemoryRedis>["redis"];
  now?: () => Date;
}) {
  const sent: unknown[] = [];
  let markCalls = 0;
  const memory = overrides?.redis ? null : makeMemoryRedis();
  const service = new PlanChangeRequestService({
    salesEmail: overrides?.salesEmail ?? "sales@example.com",
    salesEmailDeliverable: overrides?.salesEmailDeliverable,
    deploymentMode: overrides?.deploymentMode ?? "self_hosted",
    publicAppBaseUrl: overrides?.publicAppBaseUrl ?? "https://vault.example",
    redis: overrides?.redis ?? memory!.redis,
    now: overrides?.now,
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

  return { service, sent, getMarkCalls: () => markCalls, memory };
}

const baseSubmit = {
  workspaceId: "ws_1",
  actorUserId: "user_1",
  requestedPlanTier: "ENTERPRISE",
  contactEmail: "a@b.co",
  locale: "ru",
  region: "RU" as string | null,
  workspaceMemberCount: 3,
};

test("PlanChangeRequestService rejects missing sales email", async () => {
  const { service } = makeService({ salesEmail: "  " });
  await assert.rejects(
    () => service.submit({ ...baseSubmit, requestedPlanTier: "PREMIUM" }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("PlanChangeRequestService rejects when outbound email is not deliverable (logger)", async () => {
  const { service, sent, getMarkCalls } = makeService({
    salesEmailDeliverable: false,
  });
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "EMAIL_NOT_CONFIGURED",
  );
  assert.equal(sent.length, 0);
  assert.equal(getMarkCalls(), 0);
});

test("PlanChangeRequestService rejects invalid tier and email", async () => {
  const { service } = makeService();
  await assert.rejects(
    () =>
      service.submit({
        ...baseSubmit,
        requestedPlanTier: "PREMIUM",
        contactEmail: "not-an-email",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    () =>
      service.submit({
        ...baseSubmit,
        requestedPlanTier: "GOLD",
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "INVALID_REQUEST",
  );
});

test("PlanChangeRequestService rejects missing member count on self-hosted", async () => {
  const { service } = makeService();
  await assert.rejects(
    () =>
      service.submit({
        ...baseSubmit,
        workspaceMemberCount: undefined,
      }),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "INVALID_REQUEST",
  );
});

test("PlanChangeRequestService allows re-submit after already submitted", async () => {
  const { service, sent, getMarkCalls } = makeService({
    sentAt: "2026-10-22T10:00:00.000Z",
  });
  const result = await service.submit(baseSubmit);
  assert.deepEqual(result, { submitted: true });
  assert.equal(sent.length, 1);
  assert.equal(getMarkCalls(), 1);
});

test("PlanChangeRequestService allows self-hosted license request when plan_tier is already ENTERPRISE", async () => {
  const { service, sent, getMarkCalls } = makeService({
    planTier: "ENTERPRISE",
  });
  const result = await service.submit({
    ...baseSubmit,
    contactEmail: "reply@corp.example",
    workspaceMemberCount: 12,
  });
  assert.deepEqual(result, { submitted: true });
  assert.equal(sent.length, 1);
  const payload = sent[0] as { variables: Record<string, unknown> };
  assert.equal(payload.variables.currentPlanTier, "ENTERPRISE");
  assert.equal(payload.variables.requestedPlanTier, "ENTERPRISE");
  assert.equal(payload.variables.workspaceMemberCount, 12);
  assert.equal(getMarkCalls(), 1);
});

test("PlanChangeRequestService still rejects SaaS downgrade / same-tier", async () => {
  const { service } = makeService({
    deploymentMode: "saas",
    planTier: "ENTERPRISE",
  });
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "PLAN_DOWNGRADE_FORBIDDEN",
  );
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
    workspaceMemberCount: 7,
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

test("PlanChangeRequestService SaaS falls back to countMembers when count omitted", async () => {
  const { service, sent } = makeService({
    deploymentMode: "saas",
    planTier: "FREE",
    memberCount: 9,
  });
  await service.submit({
    workspaceId: "ws_1",
    actorUserId: "user_1",
    requestedPlanTier: "TEAM",
    contactEmail: "a@b.co",
    locale: "en",
    region: null,
  });
  const payload = sent[0] as { variables: Record<string, unknown> };
  assert.equal(payload.variables.workspaceMemberCount, 9);
});

test("PlanChangeRequestService getStatus reports submitted flag and deliverability", async () => {
  const pending = makeService({ sentAt: null });
  assert.deepEqual(await pending.service.getStatus({ workspaceId: "ws_1", actorUserId: "user_1" }), {
    submitted: false,
    sentAt: null,
    salesEmailDeliverable: true,
    salesEmail: "sales@example.com",
  });
  const loggerPath = makeService({
    sentAt: "2026-10-22T12:00:00.000Z",
    salesEmailDeliverable: false,
  });
  assert.deepEqual(
    await loggerPath.service.getStatus({ workspaceId: "ws_1", actorUserId: "user_1" }),
    {
      submitted: false,
      sentAt: null,
      salesEmailDeliverable: false,
      salesEmail: "sales@example.com",
    },
  );
  const smtpDone = makeService({
    sentAt: "2026-10-22T12:00:00.000Z",
    salesEmailDeliverable: true,
  });
  assert.deepEqual(
    await smtpDone.service.getStatus({ workspaceId: "ws_1", actorUserId: "user_1" }),
    {
      submitted: true,
      sentAt: "2026-10-22T12:00:00.000Z",
      salesEmailDeliverable: true,
      salesEmail: "sales@example.com",
    },
  );
});

test("PlanChangeRequestService does not mark sent when email fails", async () => {
  const { service, getMarkCalls } = makeService({
    send: async () => {
      throw new Error("smtp down");
    },
  });
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "EMAIL_SEND_FAILED",
  );
  assert.equal(getMarkCalls(), 0);
});

test("PlanChangeRequestService allows three sends per UTC day then rate-limits with Retry-After", async () => {
  const fixedNow = new Date("2026-10-24T12:00:00.000Z");
  const { service, sent, memory } = makeService({ now: () => fixedNow });
  assert.ok(memory);

  for (let i = 0; i < PLAN_CHANGE_REQUEST_DAILY_LIMIT; i += 1) {
    const result = await service.submit(baseSubmit);
    assert.deepEqual(result, { submitted: true });
  }
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);

  const key = planChangeRequestDailyRedisKey("ws_1", fixedNow);
  assert.equal(memory.counts.get(key), PLAN_CHANGE_REQUEST_DAILY_LIMIT);
  assert.equal(memory.expires.get(key), secondsUntilNextUtcMidnight(fixedNow));

  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError &&
      error.code === "RATE_LIMITED" &&
      error.status === 429 &&
      error.details?.retryAfterSeconds === secondsUntilNextUtcMidnight(fixedNow),
  );
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);
});
