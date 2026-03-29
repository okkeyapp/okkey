import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPreprodMigrationEnvironmentAllowed,
  parsePreprodMigrationCliArgs,
  runPreprodMigration,
  type PreprodMigrationAdapter,
} from "../src/tools/preprod-migration.ts";

class InMemoryPreprodMigrationAdapter implements PreprodMigrationAdapter {
  private readonly events: number[];
  private readonly vaults: number[];
  private readonly vaultToEvents: Map<number, number[]>;

  constructor(input: { events: number[]; vaults: number[]; vaultToEvents: Record<number, number[]> }) {
    this.events = [...input.events];
    this.vaults = [...input.vaults];
    this.vaultToEvents = new Map(
      Object.entries(input.vaultToEvents).map(([vaultIndex, eventIndices]) => [
        Number(vaultIndex),
        [...eventIndices],
      ]),
    );
  }

  async getSnapshot() {
    let legacyVaults = 0;
    for (let vaultIndex = 0; vaultIndex < this.vaults.length; vaultIndex += 1) {
      const eventIndices = this.vaultToEvents.get(vaultIndex) ?? [];
      let maxEventVersion = 2;
      if (eventIndices.length > 0) {
        maxEventVersion = Math.max(...eventIndices.map((idx) => this.events[idx]));
      }
      const expectedFloor = Math.max(2, maxEventVersion);
      if (this.vaults[vaultIndex] < expectedFloor) {
        legacyVaults += 1;
      }
    }

    return {
      totalVaults: this.vaults.length,
      totalEvents: this.events.length,
      legacyEvents: this.events.filter((version) => version < 2).length,
      legacyVaults,
    };
  }

  async migrateLegacyEventsToV2(): Promise<number> {
    let updated = 0;
    for (let i = 0; i < this.events.length; i += 1) {
      if (this.events[i] < 2) {
        this.events[i] = 2;
        updated += 1;
      }
    }
    return updated;
  }

  async reconcileVaultCryptoFloorToV2(): Promise<number> {
    let updated = 0;
    for (let vaultIndex = 0; vaultIndex < this.vaults.length; vaultIndex += 1) {
      const eventIndices = this.vaultToEvents.get(vaultIndex) ?? [];
      let maxEventVersion = 2;
      if (eventIndices.length > 0) {
        maxEventVersion = Math.max(...eventIndices.map((idx) => this.events[idx]));
      }
      const expectedFloor = Math.max(2, maxEventVersion);
      if (this.vaults[vaultIndex] < expectedFloor) {
        this.vaults[vaultIndex] = expectedFloor;
        updated += 1;
      }
    }
    return updated;
  }
}

test("parsePreprodMigrationCliArgs defaults to dry-run", () => {
  const parsed = parsePreprodMigrationCliArgs([]);
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.confirmPreprod, false);
});

test("parsePreprodMigrationCliArgs requires confirm for apply", () => {
  assert.throws(
    () => parsePreprodMigrationCliArgs(["--apply"]),
    /PREPROD_MIGRATION_CONFIRM_REQUIRED|apply mode requires --confirm-preprod/,
  );
});

test("parsePreprodMigrationCliArgs parses apply mode", () => {
  const parsed = parsePreprodMigrationCliArgs(["--apply", "--confirm-preprod"]);
  assert.equal(parsed.mode, "apply");
  assert.equal(parsed.confirmPreprod, true);
});

test("runPreprodMigration dry-run and apply produce comparable snapshots", async () => {
  const dryAdapter = new InMemoryPreprodMigrationAdapter({
    events: [1, 2, 1],
    vaults: [1, 2],
    vaultToEvents: { 0: [0, 1], 1: [2] },
  });
  const dryReport = await runPreprodMigration(dryAdapter, { mode: "dry-run" });
  assert.equal(dryReport.before.legacyEvents, 2);
  assert.equal(dryReport.before.legacyVaults, 1);
  assert.equal(dryReport.migratedEvents, 0);
  assert.equal(dryReport.migratedVaults, 0);

  const applyAdapter = new InMemoryPreprodMigrationAdapter({
    events: [1, 2, 1],
    vaults: [1, 2],
    vaultToEvents: { 0: [0, 1], 1: [2] },
  });
  const applyReport = await runPreprodMigration(applyAdapter, { mode: "apply" });
  assert.equal(applyReport.before.legacyEvents, dryReport.before.legacyEvents);
  assert.equal(applyReport.before.legacyVaults, dryReport.before.legacyVaults);
  assert.equal(applyReport.migratedEvents, 2);
  assert.equal(applyReport.migratedVaults, 1);
  assert.equal(applyReport.after.legacyEvents, 0);
  assert.equal(applyReport.after.legacyVaults, 0);
});

test("runPreprodMigration apply is idempotent on rerun", async () => {
  const adapter = new InMemoryPreprodMigrationAdapter({
    events: [1, 2, 2],
    vaults: [1, 2],
    vaultToEvents: { 0: [0, 1], 1: [2] },
  });

  const firstApply = await runPreprodMigration(adapter, { mode: "apply" });
  assert.equal(firstApply.migratedEvents, 1);
  assert.equal(firstApply.migratedVaults, 1);

  const secondApply = await runPreprodMigration(adapter, { mode: "apply" });
  assert.equal(secondApply.migratedEvents, 0);
  assert.equal(secondApply.migratedVaults, 0);
  assert.equal(secondApply.after.legacyEvents, 0);
  assert.equal(secondApply.after.legacyVaults, 0);
});

test("assertPreprodMigrationEnvironmentAllowed blocks prod by default", () => {
  assert.throws(
    () =>
      assertPreprodMigrationEnvironmentAllowed({
        nodeEnv: "production",
        deployEnv: "prod",
        allowProdOverride: false,
      }),
    /PREPROD_MIGRATION_PROD_FORBIDDEN|forbidden in production environment/,
  );
});

test("assertPreprodMigrationEnvironmentAllowed allows override", () => {
  assert.doesNotThrow(() =>
    assertPreprodMigrationEnvironmentAllowed({
      nodeEnv: "production",
      deployEnv: "prod",
      allowProdOverride: true,
    }),
  );
});
