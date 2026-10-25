import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_CHANGE_REQUEST_DAILY_LIMIT,
  PLAN_CHANGE_REQUEST_WINDOW_SECONDS,
  PlanChangeRequestService,
  PlanChangeRequestServiceError,
  planChangeRequestWindowRedisKey,
} from "../src/plan-change-request/service.ts";
import type { DeploymentMode } from "../src/config.ts";

function makeMemoryRedis() {
  const zsets = new Map<string, Map<string, number>>();
  const expires = new Map<string, number>();
  return {
    zsets,
    expires,
    redis: {
      zAdd: async (key: string, score: number, member: string) => {
        const set = zsets.get(key) ?? new Map<string, number>();
        const created = set.has(member) ? 0 : 1;
        set.set(member, score);
        zsets.set(key, set);
        return created;
      },
      zRemRangeByScore: async (key: string, min: number | string, max: number | string) => {
        const set = zsets.get(key);
        if (!set) {
          return 0;
        }
        const minN = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
        const maxN = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
        let removed = 0;
        for (const [member, score] of set) {
          if (score >= minN && score <= maxN) {
            set.delete(member);
            removed += 1;
          }
        }
        return removed;
      },
      zCard: async (key: string) => zsets.get(key)?.size ?? 0,
      zRangeByScoreWithScores: async (
        key: string,
        min: number | string,
        max: number | string,
        limit: number,
      ) => {
        const set = zsets.get(key) ?? new Map<string, number>();
        const minN = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
        const maxN = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
        return [...set.entries()]
          .filter(([, score]) => score >= minN && score <= maxN)
          .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
          .slice(0, limit)
          .map(([value, score]) => ({ value, score }));
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
  nowMs?: () => number;
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
    nowMs: overrides?.nowMs,
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

test("PlanChangeRequestService allows three sends per rolling 24h then rate-limits with Retry-After", async () => {
  let nowMs = Date.parse("2026-10-25T12:00:00.000Z");
  const { service, sent, memory } = makeService({ nowMs: () => nowMs });
  assert.ok(memory);

  for (let i = 0; i < PLAN_CHANGE_REQUEST_DAILY_LIMIT; i += 1) {
    nowMs += 1_000;
    const result = await service.submit(baseSubmit);
    assert.deepEqual(result, { submitted: true });
  }
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);

  const key = planChangeRequestWindowRedisKey("ws_1");
  assert.equal(memory.zsets.get(key)?.size, PLAN_CHANGE_REQUEST_DAILY_LIMIT);
  assert.equal(memory.expires.get(key), PLAN_CHANGE_REQUEST_WINDOW_SECONDS);

  nowMs += 1_000;
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError &&
      error.code === "RATE_LIMITED" &&
      error.status === 429 &&
      typeof error.details?.retryAfterSeconds === "number" &&
      error.details.retryAfterSeconds > 0 &&
      error.details.retryAfterSeconds <= PLAN_CHANGE_REQUEST_WINDOW_SECONDS,
  );
  // Rejected 429 attempts still count toward the rolling window.
  assert.equal(memory.zsets.get(key)?.size, PLAN_CHANGE_REQUEST_DAILY_LIMIT + 1);
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);
});

test("PlanChangeRequestService rolling window ages out oldest attempts (not fixed from first)", async () => {
  let nowMs = Date.parse("2026-10-25T12:00:00.000Z");
  const { service, sent, memory } = makeService({ nowMs: () => nowMs });
  assert.ok(memory);
  const key = planChangeRequestWindowRedisKey("ws_1");
  const windowMs = PLAN_CHANGE_REQUEST_WINDOW_SECONDS * 1000;

  // Three accepted attempts spaced one second apart.
  for (let i = 0; i < PLAN_CHANGE_REQUEST_DAILY_LIMIT; i += 1) {
    nowMs += 1_000;
    await service.submit(baseSubmit);
  }
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);
  const scoresAtCap = [...(memory.zsets.get(key)?.values() ?? [])].sort((a, b) => a - b);
  assert.equal(scoresAtCap.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);

  // Still inside the window of the first attempt → 429 (rejected attempt counted).
  nowMs += 1_000;
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError && error.code === "RATE_LIMITED",
  );
  assert.equal(memory.zsets.get(key)?.size, PLAN_CHANGE_REQUEST_DAILY_LIMIT + 1);
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);

  // Age out only the oldest accepted attempt: 2 accepted + 1 rejected remain → still at
  // the limit, so the next attempt is 429 (proves the window is not wiped with the first).
  nowMs = scoresAtCap[0]! + windowMs + 1;
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) =>
      error instanceof PlanChangeRequestServiceError &&
      error.code === "RATE_LIMITED" &&
      typeof error.details?.retryAfterSeconds === "number" &&
      error.details.retryAfterSeconds > 0 &&
      error.details.retryAfterSeconds < PLAN_CHANGE_REQUEST_WINDOW_SECONDS,
  );
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT);

  // Age out enough older members that only 2 remain in-window, then one send succeeds.
  const remaining = [...(memory.zsets.get(key)?.entries() ?? [])].sort((a, b) => a[1] - b[1]);
  assert.ok(remaining.length >= 3);
  nowMs = remaining[remaining.length - 3]![1] + windowMs + 1;
  await service.submit(baseSubmit);
  assert.equal(sent.length, PLAN_CHANGE_REQUEST_DAILY_LIMIT + 1);
});

test("PlanChangeRequestService Retry-After lets an honest client succeed on the next try", async () => {
  // Mirrors the QA blocker: t0 / +8h / +16h accepted; +20h 429; wait Retry-After → 200.
  const t0 = Date.parse("2026-10-25T00:00:00.000Z");
  const hour = 3_600_000;
  let nowMs = t0;
  const { service, sent } = makeService({ nowMs: () => nowMs });

  nowMs = t0;
  await service.submit(baseSubmit);
  nowMs = t0 + 8 * hour;
  await service.submit(baseSubmit);
  nowMs = t0 + 16 * hour;
  await service.submit(baseSubmit);
  assert.equal(sent.length, 3);

  nowMs = t0 + 20 * hour;
  let retryAfterSeconds = 0;
  await assert.rejects(
    () => service.submit(baseSubmit),
    (error: unknown) => {
      if (
        !(error instanceof PlanChangeRequestServiceError) ||
        error.code !== "RATE_LIMITED" ||
        typeof error.details?.retryAfterSeconds !== "number"
      ) {
        return false;
      }
      retryAfterSeconds = error.details.retryAfterSeconds;
      return retryAfterSeconds > 0;
    },
  );
  assert.equal(sent.length, 3);
  // Pivot is the 2nd-oldest (t0+8h): room for a new attempt opens at t0+32h → ~12h from +20h.
  assert.equal(retryAfterSeconds, 12 * 3600);

  nowMs = t0 + 20 * hour + retryAfterSeconds * 1000;
  const ok = await service.submit(baseSubmit);
  assert.deepEqual(ok, { submitted: true });
  assert.equal(sent.length, 4);
});
