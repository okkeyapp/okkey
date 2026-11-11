/**
 * Numeric quotas from `getPlanQuotaLimits`:
 * SaaS FREE maxAdditionalMembers = 3, PREMIUM = 10, TEAM = 25.
 * TEAM maxSharedVaults = 5. ENTERPRISE is unlimited.
 * Occupied seats = active members excluding the owner + live pending invitations.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getPlanQuotaLimits, type PlanTier } from "@okkey/types";
import { countOccupiedAdditionalMemberSeats } from "../src/workspace-members/additional-member-seats.ts";
import {
  WorkspaceMembersService,
  WorkspaceMembersServiceError,
} from "../src/workspace-members/service.ts";
import {
  WorkspaceSharedVaultsService,
  WorkspaceSharedVaultsServiceError,
} from "../src/workspace-shared-vaults/service.ts";
import { entitlementConfig } from "./entitlement-config.ts";

const actorId = "1000000000000000001";
const roleId = "1000000000000000002";
const profileId = "1000000000000000003";
const workspaceId = "1000000000000000100";
const inviteeId = "1000000000000000008";

type NumericSeatTier = "FREE" | "PREMIUM" | "TEAM";

function seatCap(planTier: PlanTier): number {
  const cap = getPlanQuotaLimits(planTier).maxAdditionalMembers;
  if (cap === null) {
    throw new Error(`${planTier} has no numeric member cap`);
  }
  return cap;
}

function memberSeatCount(sql: string, additionalMembers: number): string {
  const excludesOwner = /user_id\s*<>/i.test(sql) && /owner_id/i.test(sql);
  // A query that still counts the owner sees one extra row.
  return String(excludesOwner ? additionalMembers : additionalMembers + 1);
}

function pendingSeatCount(sql: string, livePending: number, cap: number): string {
  const liveOnly = /status\s*=\s*'pending'/i.test(sql) && /expires_at\s*>/i.test(sql);
  // Revoked rows and pending rows past expires_at fill the cap when the filter is missing.
  return String(liveOnly ? livePending : livePending + cap);
}

function isMemberSeatQuery(sql: string): boolean {
  return sql.includes("COUNT") && sql.includes("workspace_members");
}

function isPendingSeatQuery(sql: string): boolean {
  return sql.includes("COUNT") && sql.includes("workspace_invitations");
}

function membersService(options: {
  planTier: PlanTier;
  additionalMembers: number;
  livePending: number;
}) {
  const cap = getPlanQuotaLimits(options.planTier).maxAdditionalMembers;
  let invitationInserts = 0;
  let memberInserts = 0;
  const seatSql: string[] = [];
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (isMemberSeatQuery(sql)) {
          seatSql.push(sql);
          return [{ count: memberSeatCount(sql, options.additionalMembers) }];
        }
        if (isPendingSeatQuery(sql)) {
          seatSql.push(sql);
          return [{ count: pendingSeatCount(sql, options.livePending, cap ?? 0) }];
        }
        if (sql.includes("INSERT INTO workspace_invitations")) {
          invitationInserts += 1;
          return [];
        }
        if (sql.includes("INSERT INTO workspace_members")) {
          memberInserts += 1;
          return [];
        }
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
          return [{ id: actorId, email: "owner@example.com", first_name: "Ada", last_name: "Lovelace" }];
        }
        if (sql.includes("SELECT email FROM users")) {
          return [{ email: "invitee@example.com" }];
        }
        if (sql.includes("FROM roles")) {
          return [{ id: roleId, builtin_key: "user", name: "User" }];
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("FOR UPDATE")) {
          return [
            {
              id: "1000000000000000200",
              workspace_id: workspaceId,
              email: "invitee@example.com",
              role_id: roleId,
              status: "pending",
              expires_at: new Date(Date.now() + 86_400_000),
              invited_by_user_id: actorId,
              accepted_user_id: null,
            },
          ];
        }
        if (sql.includes("SELECT EXISTS")) {
          return [{ ok: false }];
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id")) {
          return [];
        }
        if (sql.includes("SELECT id FROM vaults")) {
          return [];
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: workspaceId,
        name: "Workspace",
        ownerId: actorId,
        planTier: options.planTier,
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    vaultService: {
      getVaultAccess: async () => ({ members: [], invitations: [] }),
      updateVaultAccess: async () => {},
    },
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    config: entitlementConfig(),
  });
  return {
    service,
    seatSql,
    invitationInserts: () => invitationInserts,
    memberInserts: () => memberInserts,
  };
}

function inviteBatch(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    email: `member-${index}@example.com`,
    roleId,
  }));
}

async function expectQuotaExceeded(run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof WorkspaceMembersServiceError);
    assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
    assert.equal(error.statusCode, 403);
    return true;
  });
}

test("catalog quotas match SaaS FREE, PREMIUM, and TEAM caps", () => {
  assert.equal(getPlanQuotaLimits("FREE").maxAdditionalMembers, 3);
  assert.equal(getPlanQuotaLimits("FREE").maxSharedVaults, 1);
  assert.equal(getPlanQuotaLimits("PREMIUM").maxAdditionalMembers, 10);
  assert.equal(getPlanQuotaLimits("PREMIUM").maxSharedVaults, 1);
  assert.equal(getPlanQuotaLimits("TEAM").maxAdditionalMembers, 25);
  assert.equal(getPlanQuotaLimits("TEAM").maxSharedVaults, 5);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxAdditionalMembers, null);
  assert.equal(getPlanQuotaLimits("ENTERPRISE").maxSharedVaults, null);
});

test("countOccupiedAdditionalMemberSeats excludes the owner and keeps only live pending invites", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const now = new Date("2026-11-09T00:00:00.000Z");
  const used = await countOccupiedAdditionalMemberSeats(
    {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes("workspace_members")) {
          return [{ count: "2" }];
        }
        return [{ count: "3" }];
      },
    },
    workspaceId,
    now,
  );
  assert.equal(used, 5);
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.sql ?? "", /FROM workspace_members/);
  assert.match(calls[0]?.sql ?? "", /user_id\s*<>/);
  assert.match(calls[0]?.sql ?? "", /owner_id/);
  assert.deepEqual(calls[0]?.params, [workspaceId]);
  assert.match(calls[1]?.sql ?? "", /FROM workspace_invitations/);
  assert.match(calls[1]?.sql ?? "", /status = 'pending'/);
  assert.match(calls[1]?.sql ?? "", /expires_at > \$2::timestamptz/);
  assert.deepEqual(calls[1]?.params, [workspaceId, now.toISOString()]);

  const invalid = await countOccupiedAdditionalMemberSeats(
    {
      query: async () => [{ count: "not-a-number" }],
    },
    workspaceId,
  );
  assert.equal(invalid, Number.POSITIVE_INFINITY);
});

for (const planTier of ["FREE", "PREMIUM", "TEAM"] as const satisfies readonly NumericSeatTier[]) {
  test(`${planTier} allows the owner plus exactly maxAdditionalMembers invites`, async () => {
    const cap = seatCap(planTier);
    const harness = membersService({ planTier, additionalMembers: 0, livePending: 0 });
    const created = await harness.service.createInvitations(workspaceId, actorId, inviteBatch(cap));
    assert.equal(created.length, cap);
    assert.equal(harness.invitationInserts(), cap);
    assert.equal(harness.seatSql.length, 2);
    assert.match(harness.seatSql[0] ?? "", /user_id\s*<>/);
    assert.match(harness.seatSql[0] ?? "", /owner_id/);
    assert.match(harness.seatSql[1] ?? "", /status = 'pending'/);
    assert.match(harness.seatSql[1] ?? "", /expires_at/);
  });

  test(`${planTier} rejects the invite past maxAdditionalMembers`, async () => {
    const cap = seatCap(planTier);
    const atCap = membersService({ planTier, additionalMembers: cap, livePending: 0 });
    await expectQuotaExceeded(() => atCap.service.createInvitations(workspaceId, actorId, inviteBatch(1)));
    assert.equal(atCap.invitationInserts(), 0);

    const overflowBatch = membersService({ planTier, additionalMembers: 0, livePending: 0 });
    await expectQuotaExceeded(() =>
      overflowBatch.service.createInvitations(workspaceId, actorId, inviteBatch(cap + 1)),
    );
    assert.equal(overflowBatch.invitationInserts(), 0);
  });

  test(`${planTier} counts live pending invitations and ignores revoked or expired ones`, async () => {
    const cap = seatCap(planTier);
    const filledByPending = membersService({ planTier, additionalMembers: 0, livePending: cap });
    await expectQuotaExceeded(() =>
      filledByPending.service.createInvitations(workspaceId, actorId, inviteBatch(1)),
    );
    assert.equal(filledByPending.invitationInserts(), 0);

    const roomForOne = membersService({ planTier, additionalMembers: 0, livePending: cap - 1 });
    const created = await roomForOne.service.createInvitations(workspaceId, actorId, inviteBatch(1));
    assert.equal(created.length, 1);

    // livePending 0: revoked and expired rows exist in the fixture only when the SQL
    // forgets status = 'pending' or expires_at. Those must not block a free seat.
    const staleOnly = membersService({ planTier, additionalMembers: 0, livePending: 0 });
    const staleCreated = await staleOnly.service.createInvitations(workspaceId, actorId, inviteBatch(1));
    assert.equal(staleCreated.length, 1);
  });

  test(`${planTier} does not count the owner toward maxAdditionalMembers`, async () => {
    const cap = seatCap(planTier);
    // The table holds the owner plus cap-1 other members. Counting the owner
    // would already equal the cap and reject this invite.
    const harness = membersService({ planTier, additionalMembers: cap - 1, livePending: 0 });
    const created = await harness.service.createInvitations(workspaceId, actorId, inviteBatch(1));
    assert.equal(created.length, 1);
    assert.equal(harness.invitationInserts(), 1);
  });

  test(`${planTier} accepts a seat already held by a pending invite and rejects one past the cap`, async () => {
    const cap = seatCap(planTier);
    const within = membersService({ planTier, additionalMembers: cap - 1, livePending: 1 });
    const accepted = await within.service.acceptInvitation("raw-token", inviteeId);
    assert.equal(accepted.workspaceId, workspaceId);
    assert.equal(within.memberInserts(), 1);

    const over = membersService({ planTier, additionalMembers: cap, livePending: 1 });
    await expectQuotaExceeded(() => over.service.acceptInvitation("raw-token", inviteeId));
    assert.equal(over.memberInserts(), 0);
  });
}

test("invite create and accept use the same seat count", async () => {
  const invite = membersService({ planTier: "FREE", additionalMembers: 0, livePending: 0 });
  await invite.service.createInvitations(workspaceId, actorId, inviteBatch(1));
  const accept = membersService({ planTier: "FREE", additionalMembers: 0, livePending: 1 });
  await accept.service.acceptInvitation("raw-token", inviteeId);
  assert.deepEqual(invite.seatSql, accept.seatSql);
  assert.equal(invite.seatSql.length, 2);
});

test("SaaS ENTERPRISE does not apply a numeric member cap", async () => {
  const harness = membersService({ planTier: "ENTERPRISE", additionalMembers: 10_000, livePending: 10_000 });
  const created = await harness.service.createInvitations(workspaceId, actorId, inviteBatch(1));
  assert.equal(created.length, 1);
  assert.equal(harness.seatSql.length, 0);
});

test("FREE rejects the invite that would exceed maxAdditionalMembers", async () => {
  const familyLimit = getPlanQuotaLimits("FREE").maxAdditionalMembers;
  assert.equal(familyLimit, 3);
  let inserts = 0;
  const service = new WorkspaceMembersService({
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("SELECT id, email, first_name, last_name FROM users")) {
          return [{ id: actorId, email: "owner@example.com", first_name: "Ada", last_name: "Lovelace" }];
        }
        if (sql.includes("FROM roles")) {
          return [{ id: roleId, builtin_key: "user", name: "User" }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_members")) {
          // Seat query result: additional members only (owner already excluded).
          return [{ count: String(familyLimit) }];
        }
        if (sql.includes("COUNT") && sql.includes("workspace_invitations")) {
          return [{ count: "0" }];
        }
        if (sql.includes("SELECT EXISTS")) {
          return [{ ok: false }];
        }
        if (sql.includes("FROM workspace_invitations") && sql.includes("SELECT id")) {
          return [];
        }
        if (sql.includes("INSERT INTO workspace_invitations")) {
          inserts += 1;
          return [];
        }
        return [];
      },
    } as never,
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Family",
        ownerId: actorId,
        planTier: "FREE",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
    },
    vaultService: {
      getVaultAccess: async () => ({ members: [], invitations: [] }),
      updateVaultAccess: async () => {},
    },
    publicAppBaseUrl: "http://localhost:5173",
    emailTemplates: { sendWorkspaceInvite: async () => {} },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.createInvitations("1000000000000000100", actorId, [{ email: "sixth@example.com", roleId }]),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceMembersServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
  assert.equal(inserts, 0);
});

test("TEAM rejects a shared vault past maxSharedVaults", async () => {
  const teamLimit = getPlanQuotaLimits("TEAM").maxSharedVaults;
  assert.equal(teamLimit, 5);
  const service = new WorkspaceSharedVaultsService({
    vaults: {
      findById: async () => null,
      listAccessibleByWorkspace: async () => [],
      listByWorkspace: async () => [],
      canReadVault: async () => false,
      canManageVaultSettings: async () => false,
      create: async () => {
        throw new Error("not used");
      },
      updateMetadata: async () => null,
      deleteById: async () => false,
    },
    workspaces: {
      findById: async () => ({
        id: "w1",
        name: "Team",
        ownerId: actorId,
        planTier: "TEAM",
        createdAt: "",
        updatedAt: "",
      }),
      hasAccess: async () => true,
      listAccessibleByUser: async () => [],
    },
    db: {
      query: async (sql: string) => {
        if (sql.includes("SELECT owner_id FROM workspaces")) {
          return [{ owner_id: actorId }];
        }
        if (sql.includes("COUNT") && sql.includes("is_personal")) {
          return [{ count: String(teamLimit) }];
        }
        if (sql.includes("public_pq_key")) {
          return [{
            public_key: Buffer.alloc(32, 1).toString("base64"),
            public_pq_key: Buffer.alloc(1184, 2).toString("base64"),
          }];
        }
        return [];
      },
      transaction: async <T>(fn: (tx: { query: (sql: string) => Promise<unknown[]> }) => Promise<T>) =>
        fn({
          query: async (sql: string) => {
            if (sql.includes("INSERT INTO vaults")) {
              return [
                {
                  id: "2000000000000000001",
                  workspace_id: "w1",
                  name: "Shared",
                  description: "",
                  icon: "",
                  is_personal: false,
                  owner_id: actorId,
                  crypto_version: 2,
                  created_at: "",
                  updated_at: "",
                },
              ];
            }
            if (sql.includes("SELECT EXISTS")) {
              return [{ ok: true }];
            }
            if (sql.includes("FROM profiles")) {
              return [{ id: profileId }];
            }
            if (sql.includes("current_version")) {
              return [{ current_version: 0 }];
            }
            if (sql.includes("COUNT")) {
              return [{ count: String(teamLimit) }];
            }
            return [];
          },
        }),
    },
    config: entitlementConfig(),
  });

  await assert.rejects(
    () =>
      service.createSharedVault("w1", actorId, {
        name: "One more",
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: "YQ==",
          meta: {},
        },
        members: [
          {
            userId: actorId,
            profileId,
            encryptedVaultKey: {
              crypto_version: 2,
              algorithm: "opaque",
              payload: "Yg==",
              meta: {},
            },
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceSharedVaultsServiceError);
      assert.equal(error.code, "PLAN_QUOTA_EXCEEDED");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});
