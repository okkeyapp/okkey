import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { applySqlMigrations } from "../src/storage/migrate.ts";
import {
  createIntegrationStorage,
  skipIfPostgresUnavailable,
} from "./integration-env.ts";
import {
  applyAllMigrationFiles,
  applyMigrations,
  createLoggerStub,
  listMigrationSqlFiles,
} from "./two-factor-test-helpers.ts";

test("migration directory lists every numbered SQL file in order", () => {
  const files = listMigrationSqlFiles();
  assert.ok(files.length >= 35);
  assert.equal(files[0], "0001_init.sql");
  assert.ok(files.includes("0011_workspace_role_permissions_matrix.sql"));
  assert.ok(files.includes("0032_device_blocked.sql"));
  assert.ok(files.includes("0033_account_recovery.sql"));
  assert.ok(files.includes("0034_backup_codes_exported_at.sql"));
  assert.ok(files.includes("0035_personal_data_bootstrap_dismissed.sql"));
  assert.ok(files.includes("0037_item_templates_structure_only.sql"));
  const sorted = [...files].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(files, sorted);
});

test("all migrations apply on an empty database", async (t) => {
  // Postgres-only: this suite does not open Redis. Skip instead of hanging when Redis is down.
  if (await skipIfPostgresUnavailable(t)) {
    return;
  }
  const expected = listMigrationSqlFiles();
  const schema = `mig_empty_${Date.now().toString(36)}`;
  const { Client } = (await import("pg")) as {
    Client: new (opts: { connectionString: string }) => {
      connect(): Promise<void>;
      query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
      end(): Promise<void>;
    };
  };
  const client = new Client({ connectionString: loadConfig().databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const applied = await applyAllMigrationFiles((sql) => client.query(sql));
    assert.equal(applied.length, expected.length);

    const blockedUntil = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'devices'
          AND column_name = 'blocked_until'
      `,
      [schema],
    );
    assert.equal(blockedUntil.rowCount, 1);

    const backupExported = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'user_totp_credentials'
          AND column_name = 'backup_codes_exported_at'
      `,
      [schema],
    );
    assert.equal(backupExported.rowCount, 1);

    const recoveryWrap = await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'user_vault_recovery_wrap'
      `,
      [schema],
    );
    assert.equal(recoveryWrap.rowCount, 1);

    const droppedFavicons = await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'vault_item_favicons'
      `,
      [schema],
    );
    assert.equal(droppedFavicons.rowCount, 0);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});

test("applyMigrations on the shared test database includes latest columns", async (t) => {
  const storage = await createIntegrationStorage(t);
  if (!storage) {
    return;
  }
  t.after(async () => {
    await storage.close();
  });
  await applyMigrations(storage);

  const blockedUntil = await storage.postgres.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'devices'
          AND column_name = 'blocked_until'
      ) AS exists
    `,
  );
  assert.equal(blockedUntil[0]?.exists, true);

  const backupExported = await storage.postgres.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_totp_credentials'
          AND column_name = 'backup_codes_exported_at'
      ) AS exists
    `,
  );
  assert.equal(backupExported[0]?.exists, true);

  const recoveryWrap = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.user_vault_recovery_wrap') IS NOT NULL AS exists",
  );
  assert.equal(recoveryWrap[0]?.exists, true);

  const ledger = await storage.postgres.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  assert.equal(ledger.length, listMigrationSqlFiles().length);

  const idle = await applySqlMigrations(storage.postgres, {
    logger: createLoggerStub(),
  });
  assert.equal(idle.applied.length, 0);
  assert.equal(idle.skipped.length, listMigrationSqlFiles().length);
});
