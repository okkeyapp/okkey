import assert from "node:assert/strict";
import { testEntityId } from "./test-entity-id.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateEntityId, initEntityIdGenerator } from "../src/entity-id.ts";
import { loadConfig } from "../src/config.ts";
import { PostgresDatabase } from "../src/storage/postgres.ts";
import {
  PostgresPreprodMigrationAdapter,
  runPreprodMigration,
} from "../src/tools/preprod-migration.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

function readMigration(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8");
}

async function ensurePreprodMigrationSchema(db: PostgresDatabase): Promise<void> {
  const usersTable = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (usersTable[0]?.regclass) {
    const idColumn = await db.query<{ data_type: string }>(
      `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
      `,
    );
    if (idColumn[0]?.data_type !== "bigint") {
      await db.query("DROP SCHEMA public CASCADE");
      await db.query("CREATE SCHEMA public");
    }
  }
  const afterDrop = await db.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  if (!afterDrop[0]?.regclass) {
    await db.query(readMigration("0001_init.sql"));
  }
}

test("integration: PostgresPreprodMigrationAdapter migrates legacy rows and is idempotent", async (t) => {
  const config = loadConfig();
  const db = await PostgresDatabase.connect(config.databaseUrl);

  const suffix = testEntityId();
  const email = `preprod-migration-${suffix}@okkey.local`;
  let userId: string | null = null;
  let workspaceId: string | null = null;

  t.after(async () => {
    if (workspaceId) {
      await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    }
    if (userId) {
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
    }
    await db.close();
  });

  await ensurePreprodMigrationSchema(db);
  initEntityIdGenerator(1);
  const adapter = new PostgresPreprodMigrationAdapter(db);
  const baselineSnapshot = await adapter.getSnapshot();

  const userRows = await db.query<{ id: string }>(
    `
      INSERT INTO users (id, email, public_key, encrypted_private_key, server_key_share)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [generateEntityId(), email, `pk-${suffix}`, Buffer.from([1, 2, 3]), Buffer.from([4, 5, 6])],
  );
  userId = userRows[0].id;

  const workspaceRows = await db.query<{ id: string }>(
    `
      INSERT INTO workspaces (id, name, owner_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [generateEntityId(), `preprod-${suffix}`, userId],
  );
  workspaceId = workspaceRows[0].id;

  const vaultRows = await db.query<{ id: string }>(
    `
      INSERT INTO vaults (id, workspace_id, name, is_personal, owner_id, crypto_version)
      VALUES
        ($1, $4, 'legacy-vault', false, $5, 1),
        ($2, $4, 'clean-vault', false, $5, 2),
        ($3, $4, 'legacy-empty-vault', false, $5, 1)
      RETURNING id
    `,
    [generateEntityId(), generateEntityId(), generateEntityId(), workspaceId, userId],
  );
  const [legacyVaultId, cleanVaultId] = vaultRows.map((row) => row.id);

  await db.query(
    `
      INSERT INTO events (id, vault_id, actor_id, event_type, encrypted_payload, version, payload_schema_version)
      VALUES
        ($1, $4, $6, 'ITEM_CREATE', $7, 1, 1),
        ($2, $4, $6, 'ITEM_UPDATE', $8, 2, 1),
        ($3, $5, $6, 'ITEM_CREATE', $9, 1, 2)
    `,
    [
      generateEntityId(),
      generateEntityId(),
      generateEntityId(),
      legacyVaultId,
      cleanVaultId,
      userId,
      Buffer.from([10, 11]),
      Buffer.from([12, 13]),
      Buffer.from([20, 21]),
    ],
  );

  const dryReport = await runPreprodMigration(adapter, { mode: "dry-run" });
  assert.equal(dryReport.before.totalVaults, baselineSnapshot.totalVaults + 3);
  assert.equal(dryReport.before.totalEvents, baselineSnapshot.totalEvents + 3);
  assert.equal(dryReport.before.legacyEvents, baselineSnapshot.legacyEvents + 2);
  assert.equal(dryReport.before.legacyVaults, baselineSnapshot.legacyVaults + 2);
  assert.equal(dryReport.migratedEvents, 0);
  assert.equal(dryReport.migratedVaults, 0);

  const applyReport = await runPreprodMigration(adapter, { mode: "apply" });
  assert.ok(applyReport.migratedEvents >= 2);
  assert.ok(applyReport.migratedVaults >= 2);
  assert.equal(applyReport.after.legacyEvents, 0);
  assert.equal(applyReport.after.legacyVaults, 0);

  const rerunReport = await runPreprodMigration(adapter, { mode: "apply" });
  assert.equal(rerunReport.migratedEvents, 0);
  assert.equal(rerunReport.migratedVaults, 0);
});

test("integration: CLI blocks execution in production environment", () => {
  const cliPath = path.resolve(__dirname, "../src/tools/preprod-migrate-v1-to-v2.ts");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, "--dry-run"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DEPLOY_ENV: "prod",
      INTERNAL_PREPROD_MIGRATION_ALLOW_PROD: "",
      // Avoid inheriting dev `.env` profile list (e.g. 1,2) which fails prod policy before prod guard runs.
      CRYPTO_ALLOWED_PROFILE_VERSIONS: "2",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /PREPROD_MIGRATION_PROD_FORBIDDEN/);
});
