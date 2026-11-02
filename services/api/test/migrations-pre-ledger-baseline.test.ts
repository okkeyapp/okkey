import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.ts";
import {
  applySqlMigrations,
  preLedgerBaselineFilenames,
  type ApplyMigrationsOptions,
} from "../src/storage/migrate.ts";
import type { PostgresDatabase, QueryExecutor } from "../src/storage/postgres.ts";
import { listMigrationSqlFiles, createLoggerStub } from "./two-factor-test-helpers.ts";
import { skipIfPostgresUnavailable } from "./integration-env.ts";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

const BETA1_LAST = "0034_backup_codes_exported_at.sql";

test("pre-ledger baseline stops at the last matching checkpoint", () => {
  const files = [
    "0001_init.sql",
    "0033_account_recovery.sql",
    BETA1_LAST,
    "0035_personal_data_bootstrap_dismissed.sql",
    "0036_attachment_purpose.sql",
    "0041_session_scope.sql",
  ];
  const beta1 = preLedgerBaselineFilenames(files, (filename) => filename === BETA1_LAST);
  assert.equal(beta1[0], "0001_init.sql");
  assert.equal(beta1.at(-1), BETA1_LAST);
  assert.equal(beta1.includes("0035_personal_data_bootstrap_dismissed.sql"), false);
  assert.equal(beta1.includes("0041_session_scope.sql"), false);

  const through36 = preLedgerBaselineFilenames(
    files,
    (filename) =>
      filename === BETA1_LAST ||
      filename === "0035_personal_data_bootstrap_dismissed.sql" ||
      filename === "0036_attachment_purpose.sql",
  );
  assert.equal(through36.at(-1), "0036_attachment_purpose.sql");
  assert.equal(through36.includes("0041_session_scope.sql"), false);

  assert.deepEqual(
    preLedgerBaselineFilenames(files, () => false),
    [],
  );
});

test("v1.0.0-beta.1 schema is upgraded by running migrations after 0034", async (t) => {
  if (await skipIfPostgresUnavailable(t)) {
    return;
  }
  const { Client } = (await import("pg")) as {
    Client: new (opts: { connectionString: string }) => {
      connect(): Promise<void>;
      query(
        sql: string,
        params?: unknown[],
      ): Promise<{ rows: unknown[]; rowCount: number | null }>;
      end(): Promise<void>;
    };
  };
  const schema = `mig_beta1_${Date.now().toString(36)}`;
  const client = new Client({ connectionString: loadConfig().databaseUrl });
  await client.connect();
  const txQuery = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  };
  const db = {
    async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      await client.query("BEGIN");
      try {
        const value = await fn({ query: txQuery });
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  } as PostgresDatabase;

  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const beta1Files = listMigrationSqlFiles().filter((name) => name.localeCompare(BETA1_LAST) <= 0);
    assert.equal(beta1Files.at(-1), BETA1_LAST);
    assert.equal(beta1Files.includes("0041_session_scope.sql"), false);
    for (const name of beta1Files) {
      await client.query(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
    const beforeScope = await txQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sessions'
            AND column_name = 'scope'
        ) AS exists
      `,
    );
    assert.equal(beforeScope[0]?.exists, false);
    const beforeLedger = await txQuery<{ exists: boolean }>(
      "SELECT to_regclass(current_schema() || '.schema_migrations') IS NOT NULL AS exists",
    );
    assert.equal(beforeLedger[0]?.exists, false);

    const logger: NonNullable<ApplyMigrationsOptions["logger"]> = createLoggerStub();
    const first = await applySqlMigrations(db, { migrationsDir, logger });
    assert.equal(first.applied.includes("0001_init.sql"), false);
    assert.equal(first.applied.includes("0034_backup_codes_exported_at.sql"), false);
    assert.equal(first.skipped.includes("0001_init.sql"), true);
    assert.equal(first.skipped.includes(BETA1_LAST), true);
    assert.equal(first.applied.includes("0035_personal_data_bootstrap_dismissed.sql"), true);
    assert.equal(first.applied.includes("0041_session_scope.sql"), true);
    assert.equal(first.applied.includes("0042_events_item_soft_deleted.sql"), true);

    const scope = await txQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'sessions'
            AND column_name = 'scope'
        ) AS exists
      `,
    );
    assert.equal(scope[0]?.exists, true);
    const dismissed = await txQuery<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'workspace_member_item_category_preferences'
            AND column_name = 'personal_data_bootstrap_dismissed'
        ) AS exists
      `,
    );
    assert.equal(dismissed[0]?.exists, true);

    const again = await applySqlMigrations(db, { migrationsDir, logger });
    assert.equal(again.applied.length, 0);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
