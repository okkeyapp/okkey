/**
 * Concurrent quota gates for shared vaults and invitation seats.
 *
 * createSharedVault and createInvitations lock the workspace row (FOR UPDATE),
 * re-check the quota, and insert in the same transaction so parallel requests
 * at the plan limit cannot both succeed.
 *
 * Finite-cap plans covered: SaaS FREE and SaaS PREMIUM (maxSharedVaults=1 on both;
 * maxAdditionalMembers 3 / 10). Catalog ENTERPRISE shared-vault and seat quotas
 * are unlimited when an enterprise license is active, so they have no numeric boundary.
 */
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { getPlanQuotaLimits, type PlanTier } from "@okkey/types";
import { loadConfig } from "../src/config.ts";
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
import { createIntegrationStorage } from "./integration-env.ts";
import { hostedTestConfig } from "./test-api-config.ts";
import { testEntityId } from "./test-entity-id.ts";
import {
  applyMigrations,
  cleanupUserData,
  registerUser,
} from "./two-factor-test-helpers.ts";

const FINITE_PLANS = ["FREE", "PREMIUM"] as const satisfies readonly PlanTier[];

function hybridWrap(recipientUserId: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: "Yg==",
    meta: {
      entity: "vault_key_wrap",
      key_wrap_scheme: "hybrid_ecc_pq_v1",
      recipient_user_id: recipientUserId,
    },
  };
}

function vaultCreateInput(name: string, userId: string, profileId: string) {
  return {
    name,
    encryptedPayload: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: "YQ==",
      meta: { entity: "vault_event_payload" },
    },
    members: [
      {
        userId,
        profileId,
        encryptedVaultKey: hybridWrap(userId),
      },
    ],
  };
}

async function prepareWorkspace(
  t: TestContext,
  planTier: PlanTier,
): Promise<{
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>;
  userId: string;
  workspaceId: string;
  profileId: string;
  roleId: string;
  vaultService: WorkspaceSharedVaultsService;
  membersService: WorkspaceMembersService;
} | null> {
  const config = hostedTestConfig(loadConfig());
  const storage = await createIntegrationStorage(t, config);
  if (!storage) {
    return null;
  }
  await applyMigrations(storage);

  const email = `quota-concurrency-${planTier.toLowerCase()}-${testEntityId()}@okkey.local`;
  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  const workspaceRows = await storage.postgres.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1",
    [userId],
  );
  const workspaceId = workspaceRows[0]?.id;
  assert.ok(workspaceId);

  await storage.postgres.query("UPDATE workspaces SET plan_tier = $2 WHERE id = $1", [
    workspaceId,
    planTier,
  ]);

  const profileRows = await storage.postgres.query<{ id: string }>(
    `
      SELECT id FROM profiles
      WHERE workspace_id = $1 AND builtin_key = 'extended'
      LIMIT 1
    `,
    [workspaceId],
  );
  const profileId = profileRows[0]?.id;
  assert.ok(profileId);

  const roleRows = await storage.postgres.query<{ id: string }>(
    `
      SELECT id FROM roles
      WHERE workspace_id = $1 AND builtin_key = 'user'
      LIMIT 1
    `,
    [workspaceId],
  );
  const roleId = roleRows[0]?.id;
  assert.ok(roleId);

  const planConfig = entitlementConfig({
    deploymentMode: "saas",
    hostedDeploymentConfirmed: true,
  });

  const vaultService = new WorkspaceSharedVaultsService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
    db: storage.postgres,
    config: planConfig,
  });

  const membersService = new WorkspaceMembersService({
    deploymentMode: "saas",
    db: storage.postgres,
    workspaces: storage.repositories.workspaces,
    publicAppBaseUrl: "http://localhost:5173",
    config: planConfig,
  });

  return {
    storage,
    userId,
    workspaceId,
    profileId,
    roleId,
    vaultService,
    membersService,
  };
}

async function countSharedVaults(
  storage: NonNullable<Awaited<ReturnType<typeof createIntegrationStorage>>>,
  workspaceId: string,
): Promise<number> {
  const rows = await storage.postgres.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM vaults
      WHERE workspace_id = $1 AND is_personal = false
    `,
    [workspaceId],
  );
  return Number(rows[0]?.count ?? 0);
}

function assertQuotaRejection(error: unknown): boolean {
  const isVault = error instanceof WorkspaceSharedVaultsServiceError;
  const isMembers = error instanceof WorkspaceMembersServiceError;
  assert.ok(isVault || isMembers);
  assert.equal((error as { code: string }).code, "PLAN_QUOTA_EXCEEDED");
  assert.equal((error as { statusCode: number }).statusCode, 403);
  return true;
}

async function assertParallelOneSuccessRestQuota(
  results: PromiseSettledResult<unknown>[],
): Promise<void> {
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one request must succeed");
  assert.equal(
    rejected.length,
    results.length - 1,
    `exactly ${results.length - 1} request(s) must be rejected`,
  );
  for (const result of rejected) {
    assertQuotaRejection((result as PromiseRejectedResult).reason);
  }
}

/**
 * Parallel racers for the last free seat. Paired with seatReservationHold so every
 * racer enters the insert transaction before any takes the workspace row lock;
 * without FOR UPDATE several inserts commit and occupied seats exceed the cap.
 */
const SEAT_RACE_PARALLEL = 5;

/** Rendezvous `parallel` callers, then release them together. */
function createRendezvous(parallel: number): () => Promise<void> {
  let waiting = 0;
  let releaseAll: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  return async () => {
    waiting += 1;
    if (waiting >= parallel) {
      releaseAll?.();
    }
    await gate;
  };
}

for (const planTier of FINITE_PLANS) {
  const vaultCap = getPlanQuotaLimits(planTier).maxSharedVaults;
  assert.equal(vaultCap, 1);

  test(`parallel createSharedVault at ${planTier} maxSharedVaults=1 yields one success and one PLAN_QUOTA_EXCEEDED`, async (t) => {
    const ctx = await prepareWorkspace(t, planTier);
    if (!ctx) {
      return;
    }
    const { storage, userId, workspaceId, profileId, vaultService } = ctx;

    assert.equal(await countSharedVaults(storage, workspaceId), 0);

    const results = await Promise.allSettled([
      vaultService.createSharedVault(
        workspaceId,
        userId,
        vaultCreateInput(`Shared-A-${planTier}`, userId, profileId),
      ),
      vaultService.createSharedVault(
        workspaceId,
        userId,
        vaultCreateInput(`Shared-B-${planTier}`, userId, profileId),
      ),
    ]);

    await assertParallelOneSuccessRestQuota(results);
    assert.equal(await countSharedVaults(storage, workspaceId), vaultCap);
  });
}

for (const planTier of FINITE_PLANS) {
  const seatCap = getPlanQuotaLimits(planTier).maxAdditionalMembers;
  assert.ok(seatCap !== null);

  test(`parallel invitation batches at the ${planTier} seat limit yield one success and PLAN_QUOTA_EXCEEDED for the rest`, async (t) => {
    const ctx = await prepareWorkspace(t, planTier);
    if (!ctx) {
      return;
    }
    const { storage, userId, workspaceId, roleId, membersService } = ctx;

    // Leave exactly one seat free, then race many single-invite batches. The
    // seatReservationHold rendezvous forces every racer into the insert
    // transaction before any takes FOR UPDATE. Without that lock, all insert and
    // occupied seats exceed the cap (e.g. FREE: 2 preloaded + 5 inserts → 7 vs 3).
    const preload = seatCap - 1;
    if (preload > 0) {
      const batch = Array.from({ length: preload }, () => ({
        roleId,
        deliveryMethod: "link" as const,
      }));
      const created = await membersService.createInvitations(workspaceId, userId, batch);
      assert.equal(created.created.length, preload);
    }

    const occupiedBefore = await countOccupiedAdditionalMemberSeats(storage.postgres, workspaceId);
    assert.equal(occupiedBefore, seatCap - 1);

    const planConfig = entitlementConfig({
      deploymentMode: "saas",
      hostedDeploymentConfirmed: true,
    });
    const racingMembers = new WorkspaceMembersService({
      deploymentMode: "saas",
      db: storage.postgres,
      workspaces: storage.repositories.workspaces,
      publicAppBaseUrl: "http://localhost:5173",
      config: planConfig,
      seatReservationHold: createRendezvous(SEAT_RACE_PARALLEL),
    });

    const results = await Promise.allSettled(
      Array.from({ length: SEAT_RACE_PARALLEL }, () =>
        racingMembers.createInvitations(workspaceId, userId, [
          { roleId, deliveryMethod: "link" },
        ]),
      ),
    );

    await assertParallelOneSuccessRestQuota(results);
    const occupiedAfter = await countOccupiedAdditionalMemberSeats(storage.postgres, workspaceId);
    assert.equal(occupiedAfter, seatCap);
  });
}
