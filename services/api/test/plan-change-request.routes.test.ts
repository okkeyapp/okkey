import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";

import { PlanChangeRequestService } from "../src/plan-change-request/service.ts";
import { createWorkspacePlanChangeRequestRoute } from "../src/routes/workspace-plan-change-request.ts";

const WS_A = "1000000001";
const WS_B = "1000000002";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function makeRedis() {
  const zsets = new Map<string, Map<string, number>>();
  return {
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
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([value, score]) => ({ value, score }));
    },
    expire: async () => true,
  };
}

function makeService(nowMs: () => number) {
  const sent: string[] = [];
  const service = new PlanChangeRequestService({
    salesEmail: "sales@example.com",
    salesEmailDeliverable: true,
    deploymentMode: "self_hosted",
    publicAppBaseUrl: "https://vault.example",
    redis: makeRedis(),
    nowMs,
    db: {
      query: async (sql: string) => {
        if (sql.includes("owner_id")) {
          return [{ owner_id: "user_1" }];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    } as never,
    workspaces: {
      findById: async (id: string) => ({
        id,
        name: "Demo",
        ownerId: "user_1",
        planTier: "FREE",
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
        planChangeRequestSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      countMembers: async () => 2,
      markPlanChangeRequestSent: async () => true,
    },
    users: {
      loadAccountProfile: async () => ({
        email: "owner@example.com",
        firstName: "A",
        lastName: "B",
        locale: "en",
        billingRegion: "US",
        vaultIdleLockSeconds: 900,
        masterPasswordChangedAt: new Date().toISOString(),
      }),
    },
    emailTemplates: {
      sendPlanChangeRequest: async (input) => {
        sent.push(input.variables.workspaceId);
      },
    },
  });
  return { service, sent };
}

async function post(
  service: PlanChangeRequestService,
  workspaceId: string,
  contactEmail = "a@b.co",
): Promise<MockResponse> {
  const handler = createWorkspacePlanChangeRequestRoute(service, async () => "user_1");
  const req = {
    method: "POST",
    url: `/workspaces/${workspaceId}/plan-change-requests`,
    headers: { "x-user-id": "user_1" },
    body: {
      requested_plan_tier: "ENTERPRISE",
      contact_email: contactEmail,
      locale: "en",
      region: "US",
      workspace_member_count: 3,
    },
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    requestId: "req_test",
    req,
    res: res as unknown as ServerResponse,
    params: { workspaceId },
  });
  return res;
}

test("POST plan-change-requests rejects malformed JSON with INVALID_JSON", async () => {
  const { service } = makeService(() => Date.parse("2026-10-25T12:00:00.000Z"));
  const handler = createWorkspacePlanChangeRequestRoute(service, async () => "user_1");
  const req = {
    method: "POST",
    url: `/workspaces/${WS_A}/plan-change-requests`,
    headers: { "content-type": "application/json" },
    body: "{not-json",
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    requestId: "req_bad_json",
    req,
    res: res as unknown as ServerResponse,
    params: { workspaceId: WS_A },
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "INVALID_JSON");
});

test("POST plan-change-requests allows 3 then 429 with Retry-After and no extra email", async () => {
  let nowMs = Date.parse("2026-10-25T12:00:00.000Z");
  const { service, sent } = makeService(() => nowMs);

  for (let i = 0; i < 3; i += 1) {
    nowMs += 1_000;
    const ok = await post(service, WS_A);
    assert.equal(ok.statusCode, 200, ok.body);
  }
  assert.equal(sent.length, 3);

  nowMs += 1_000;
  const blocked = await post(service, WS_A);
  assert.equal(blocked.statusCode, 429);
  const retryAfter = Number(blocked.getHeader("retry-after"));
  assert.ok(retryAfter > 0);
  const payload = JSON.parse(blocked.body) as {
    error: string;
    details?: { retryAfterSeconds?: number; availableAt?: string };
  };
  assert.equal(payload.error, "RATE_LIMITED");
  assert.equal(payload.details?.retryAfterSeconds, retryAfter);
  assert.equal(payload.details?.availableAt, new Date(nowMs + retryAfter * 1000).toISOString());
  assert.equal(sent.filter((id) => id === WS_A).length, 3);

  const other = await post(service, WS_B);
  assert.equal(other.statusCode, 200, other.body);
  assert.deepEqual(sent.filter((id) => id === WS_B), [WS_B]);

  nowMs += retryAfter * 1000;
  const again = await post(service, WS_A);
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(sent.filter((id) => id === WS_A).length, 4);
});

test("POST plan-change-requests rejects malformed contact emails", async () => {
  let nowMs = Date.parse("2026-10-25T12:00:00.000Z");
  const { service, sent } = makeService(() => nowMs);
  const tooLong = `${"a".repeat(316)}@x.co`;
  assert.equal(tooLong.length, 321);

  for (const contactEmail of ["a@", "@b", "x@y", tooLong]) {
    nowMs += 1_000;
    const res = await post(service, WS_A, contactEmail);
    assert.equal(res.statusCode, 400, `${contactEmail} -> ${res.body}`);
    const payload = JSON.parse(res.body) as { error: string };
    assert.equal(payload.error, "INVALID_REQUEST");
  }

  nowMs += 1_000;
  const ok = await post(service, WS_A, "reply@example.com");
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(sent.length, 1);
});
