import test from "node:test";
import assert from "node:assert/strict";

import { STORAGE_QUOTA_BYTES_PER_MIB } from "../../../packages/types/src/plan-features.ts";
import {
  PLAN_QUOTA_EXCEEDED_MESSAGE,
  PlanQuotaExceededError,
  WorkspaceStorageQuotaService,
} from "../src/storage-quota/service.ts";
import type { QueryExecutor } from "../src/storage/postgres.ts";

function scriptedDb(
  respond: (sql: string) => Record<string, unknown>[],
): QueryExecutor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query<T>(sql: string): Promise<T[]> {
      calls.push(sql);
      return respond(sql) as T[];
    },
  };
}

function quotaService(
  deploymentMode: "saas" | "self_hosted",
  respond: (sql: string) => Record<string, unknown>[],
) {
  const db = scriptedDb(respond);
  const service = new WorkspaceStorageQuotaService({
    db,
    config: { deploymentMode, enterpriseModulesEnabled: false },
  });
  return { service, db };
}

test("storage quota is not enforced when the storageQuotas flag is off", async () => {
  const limit = 100 * STORAGE_QUOTA_BYTES_PER_MIB;
  const { service, db } = quotaService("saas", (sql) => {
    if (sql.includes("used_bytes")) {
      return [{ used_bytes: String(limit) }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const workspace = {
    id: "1000000000000000001",
    planTier: "FREE" as const,
    planCustomOverride: true,
    planFeatureOverrides: { storageQuotas: false },
  };
  await service.assertAdditionalBytes({
    workspace,
    additionalBytes: limit,
  });
  assert.equal(db.calls.length, 0);
  const snapshot = await service.snapshot(workspace);
  assert.equal(snapshot.baseMb, null);
  assert.equal(snapshot.limitBytes, null);
  assert.equal(snapshot.usedBytes, limit);
});

test("self-hosted storage quota never blocks writes", async () => {
  const { service, db } = quotaService("self_hosted", (sql) => {
    if (sql.includes("used_bytes")) {
      return [{ used_bytes: "42" }];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  await service.assertAdditionalBytes({
    workspace: { id: "1000000000000000001", planTier: "ENTERPRISE" },
    additionalBytes: 50 * STORAGE_QUOTA_BYTES_PER_MIB,
  });
  assert.equal(db.calls.length, 0);
  const snapshot = await service.snapshot({ id: "1000000000000000001", planTier: "FREE" });
  assert.equal(snapshot.limitBytes, null);
  assert.equal(snapshot.baseMb, null);
  assert.equal(snapshot.usedBytes, 42);

  const modulesOn = new WorkspaceStorageQuotaService({
    db: scriptedDb(() => {
      throw new Error("self-hosted modules on must not query usage for a write");
    }),
    config: { deploymentMode: "self_hosted", enterpriseModulesEnabled: true },
  });
  await modulesOn.assertAdditionalBytes({
    workspace: { id: "1000000000000000001", planTier: "FREE" },
    additionalBytes: 50 * STORAGE_QUOTA_BYTES_PER_MIB,
  });
});

test("SaaS FREE ceiling is 100 MiB and rejects the next byte", async () => {
  const limit = 100 * STORAGE_QUOTA_BYTES_PER_MIB;
  const { service } = quotaService("saas", (sql) => {
    if (sql.includes("workspace_members")) {
      return [{ count: "1" }];
    }
    if (sql.includes("used_bytes")) {
      return [{ used_bytes: String(limit) }];
    }
    return [];
  });
  const snapshot = await service.snapshot({ id: "1000000000000000001", planTier: "FREE" });
  assert.equal(snapshot.limitMb, 100);
  assert.equal(snapshot.usedBytes, limit);
  await service.assertAdditionalBytes({
    workspace: { id: "1000000000000000001", planTier: "FREE" },
    additionalBytes: 0,
  });
  await assert.rejects(
    () =>
      service.assertAdditionalBytes({
        workspace: { id: "1000000000000000001", planTier: "FREE" },
        additionalBytes: 1,
      }),
    (error: unknown) =>
      error instanceof PlanQuotaExceededError &&
      error.code === "PLAN_QUOTA_EXCEEDED" &&
      error.statusCode === 403 &&
      error.message === PLAN_QUOTA_EXCEEDED_MESSAGE &&
      error.details.limitMb === 100,
  );
});

test("SaaS PREMIUM is 5120 MiB and TEAM/ENTERPRISE add 5120 MiB per member plus 5120 shared", async () => {
  const respond = (members: string) => (sql: string) => {
    if (sql.includes("workspace_members")) {
      return [{ count: members }];
    }
    if (sql.includes("used_bytes")) {
      return [{ used_bytes: "0" }];
    }
    return [];
  };
  const premium = quotaService("saas", respond("1")).service;
  const premiumStatus = await premium.snapshot({ id: "1", planTier: "PREMIUM" });
  assert.equal(premiumStatus.limitMb, 5120);

  const team = quotaService("saas", respond("4")).service;
  const teamStatus = await team.snapshot({ id: "1", planTier: "TEAM" });
  assert.equal(teamStatus.limitMb, 5120 * 4 + 5120);

  const enterprise = quotaService("saas", respond("2")).service;
  const enterpriseStatus = await enterprise.snapshot({ id: "1", planTier: "ENTERPRISE" });
  assert.equal(enterpriseStatus.limitMb, 5120 * 2 + 5120);
  assert.notEqual(enterpriseStatus.limitBytes, null);
});

test("workspace logo ciphertext is part of measured usage and blocks the next logo byte", async () => {
  const limit = 100 * STORAGE_QUOTA_BYTES_PER_MIB;
  const { service, db } = quotaService("saas", (sql) => {
    if (sql.includes("workspace_members")) {
      return [{ count: "1" }];
    }
    if (sql.includes("used_bytes")) {
      assert.match(sql, /workspace_logos/);
      assert.match(sql, /ciphertext_bytes/);
      return [{ used_bytes: String(limit) }];
    }
    return [];
  });
  const snapshot = await service.snapshot({ id: "1000000000000000001", planTier: "FREE" });
  assert.equal(snapshot.usedBytes, limit);
  await assert.rejects(
    () =>
      service.assertAdditionalBytes({
        workspace: { id: "1000000000000000001", planTier: "FREE" },
        additionalBytes: 80,
        replacedBytes: 0,
      }),
    (error: unknown) => error instanceof PlanQuotaExceededError,
  );
  await service.assertAdditionalBytes({
    workspace: { id: "1000000000000000001", planTier: "FREE" },
    additionalBytes: 80,
    replacedBytes: 80,
  });
  assert.ok(db.calls.some((sql) => sql.includes("FROM workspace_logos")));
});

test("replacing bytes does not count the overwritten ciphertext twice", async () => {
  const limit = 100 * STORAGE_QUOTA_BYTES_PER_MIB;
  const { service } = quotaService("saas", (sql) => {
    if (sql.includes("workspace_members")) {
      return [{ count: "1" }];
    }
    if (sql.includes("AS excluded")) {
      return [{ bytes: "40", excluded: false }];
    }
    if (sql.includes("used_bytes")) {
      return [{ used_bytes: String(limit) }];
    }
    return [];
  });
  await service.assertVaultItemWrite({
    workspace: { id: "1000000000000000001", planTier: "FREE" },
    vaultId: "1000000000000000002",
    referencedItemId: "1000000000000000003",
    eventType: "ITEM_UPDATE",
    nextPayloadBytes: 40,
  });
  await assert.rejects(
    () =>
      service.assertVaultItemWrite({
        workspace: { id: "1000000000000000001", planTier: "FREE" },
        vaultId: "1000000000000000002",
        referencedItemId: "1000000000000000003",
        eventType: "ITEM_UPDATE",
        nextPayloadBytes: 41,
      }),
    (error: unknown) => error instanceof PlanQuotaExceededError,
  );
});
