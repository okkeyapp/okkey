import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import {
  applyAllMigrationFiles,
  applyMigrations,
  createLoggerStub,
  listMigrationSqlFiles,
} from "./two-factor-test-helpers.ts";

test("migration directory contains every numbered file through 0034", () => {
  const files = listMigrationSqlFiles();
  assert.equal(files.length, 34);
  assert.equal(files[0], "0001_init.sql");
  assert.equal(files.at(-1), "0034_backup_codes_exported_at.sql");
  assert.ok(files.includes("0011_workspace_role_permissions_matrix.sql"));
  assert.ok(files.includes("0032_device_blocked.sql"));
  assert.ok(files.includes("0033_account_recovery.sql"));
});

test("all migrations apply on an empty database", async () => {
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
    assert.equal(applied.length, 34);

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
  const storage = await createStorageLayer(loadConfig(), createLoggerStub());
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
});
