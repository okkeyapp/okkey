import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import {
  applySqlMigrations,
  duplicateMigrationNumbers,
  MIGRATION_APPLIED_NAME_ALIASES,
} from "../src/storage/migrate.ts";
import type { PostgresDatabase, QueryExecutor } from "../src/storage/postgres.ts";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

function listMigrationSqlFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));
}

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

/** Last migration shipped in v1.0.0-beta.2 (tag and release/1.0.0-beta.2). */
const BETA2_LAST = "0043_recovery_possession.sql";

const WORKSPACE_KEYS = "0048_workspace_keys.sql";
const ROTATION_QUEUE = "0049_workspace_key_rotation_queue.sql";
const FAMILY_TIER = "0047_retire_family_plan_tier.sql";

test("duplicateMigrationNumbers reports shared prefixes only", () => {
  assert.deepEqual(duplicateMigrationNumbers(["0044_a.sql", "0045_b.sql", "0046_c.sql"]), []);
  assert.deepEqual(
    duplicateMigrationNumbers(["0045_retire_family_plan_tier.sql", "0045_workspace_keys.sql", "0046_other.sql"]),
    ["0045"],
  );
  assert.deepEqual(
    duplicateMigrationNumbers([
      "0044_device_share_delivery.sql",
      "0044_system_update_dismissals.sql",
      "0044_user_public_mldsa_key.sql",
    ]),
    ["0044"],
  );
});

test("migration numbers are unique and legacy filenames are aliases only", () => {
  const files = listMigrationSqlFiles();
  assert.deepEqual(duplicateMigrationNumbers(files), []);

  const fileSet = new Set(files);
  const legacySeen = new Set<string>();
  for (const [current, legacyNames] of Object.entries(MIGRATION_APPLIED_NAME_ALIASES)) {
    assert.equal(fileSet.has(current), true, current);
    assert.ok(legacyNames.length > 0, current);
    for (const legacy of legacyNames) {
      assert.equal(fileSet.has(legacy), false, legacy);
      assert.equal(legacySeen.has(legacy), false, legacy);
      legacySeen.add(legacy);
      assert.notEqual(legacy.slice(0, 4), current.slice(0, 4));
    }
  }

  const ordered = [
    "0044_device_share_delivery.sql",
    "0045_system_update_dismissals.sql",
    "0046_user_public_mldsa_key.sql",
    FAMILY_TIER,
    WORKSPACE_KEYS,
    ROTATION_QUEUE,
  ];
  const tail = files.slice(files.indexOf(ordered[0]));
  assert.deepEqual(tail, ordered);
});

test("clean database applies every migration once through the runner", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  const expected = listMigrationSqlFiles();
  await withSchema(async ({ db, query }) => {
    const first = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(first.applied, expected);
    assert.deepEqual(first.skipped, []);

    const ledger = await query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY filename");
    assert.deepEqual(
      ledger.map((row) => row.filename),
      expected,
    );
    assert.equal(await tableExists(query, "workspace_key_wraps"), true);
    assert.equal(await tableExists(query, "workspace_key_rotation_queue"), true);
    assert.equal(await tableExists(query, "system_update_dismissals"), true);
    assert.equal(await columnExists(query, "users", "public_mldsa_key"), true);
    assert.equal(await columnExists(query, "devices", "one_time_x25519_public"), true);

    const again = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(again.applied, []);
    assert.equal(again.skipped.length, expected.length);
  });
});

test("upgrade from v1.0.0-beta.2 applies migrations after 0043 once", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  const files = listMigrationSqlFiles();
  const beta2 = files.filter((name) => name.localeCompare(BETA2_LAST) <= 0);
  const after = files.filter((name) => name.localeCompare(BETA2_LAST) > 0);
  assert.equal(beta2.at(-1), BETA2_LAST);
  assert.deepEqual(after, [
    "0044_device_share_delivery.sql",
    "0045_system_update_dismissals.sql",
    "0046_user_public_mldsa_key.sql",
    FAMILY_TIER,
    WORKSPACE_KEYS,
    ROTATION_QUEUE,
  ]);

  await withSchema(async ({ db, query }) => {
    for (const name of beta2) {
      await query(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
    await query(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const name of beta2) {
      await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [name]);
    }
    assert.equal(await tableExists(query, "workspace_key_wraps"), false);

    const upgraded = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(upgraded.applied, after);
    assert.equal(upgraded.skipped.includes(BETA2_LAST), true);
    assert.equal(upgraded.skipped.includes("0001_init.sql"), true);
    assert.equal(await tableExists(query, "workspace_key_wraps"), true);
    assert.equal(await tableExists(query, "workspace_logos"), true);
    assert.equal(await columnExists(query, "workspaces", "client_settings_ciphertext"), true);

    const again = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(again.applied, []);
  });
});

test("journal row for the old 0045 family migration is not applied again", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  const files = listMigrationSqlFiles();
  const pending = new Set([WORKSPACE_KEYS, ROTATION_QUEUE]);
  await withSchema(async ({ db, query }) => {
    await query(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const name of files) {
      if (pending.has(name)) {
        continue;
      }
      await query(readFileSync(path.join(migrationsDir, name), "utf8"));
      const recorded = MIGRATION_APPLIED_NAME_ALIASES[name]?.[0] ?? name;
      await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [recorded]);
    }
    const before = await query<{ filename: string }>("SELECT filename FROM schema_migrations");
    assert.equal(
      before.some((row) => row.filename === "0045_retire_family_plan_tier.sql"),
      true,
    );
    assert.equal(
      before.some((row) => row.filename === "0045_workspace_keys.sql"),
      false,
    );
    assert.equal(await tableExists(query, "workspace_key_wraps"), false);

    const upgraded = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(upgraded.applied, [WORKSPACE_KEYS, ROTATION_QUEUE]);
    assert.equal(upgraded.skipped.includes(FAMILY_TIER), true);
    assert.equal(await tableExists(query, "workspace_key_wraps"), true);
    assert.equal(await tableExists(query, "workspace_key_rotation_queue"), true);

    const ledger = await query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY filename");
    assert.deepEqual(
      ledger.map((row) => row.filename),
      files,
    );
    assert.equal(
      ledger.some((row) => row.filename === "0045_retire_family_plan_tier.sql"),
      false,
    );

    const again = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(again.applied, []);
  });
});

test("both old 0045 filenames stay applied and are renamed in the journal", async (t) => {
  if (await skipIfPostgresDown(t)) {
    return;
  }
  const files = listMigrationSqlFiles();
  await withSchema(async ({ db, query }) => {
    await query(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const name of files) {
      await query(readFileSync(path.join(migrationsDir, name), "utf8"));
      const recorded = MIGRATION_APPLIED_NAME_ALIASES[name]?.[0] ?? name;
      await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [recorded]);
    }
    const before = await query<{ filename: string }>("SELECT filename FROM schema_migrations");
    assert.equal(
      before.some((row) => row.filename === "0045_retire_family_plan_tier.sql"),
      true,
    );
    assert.equal(
      before.some((row) => row.filename === "0045_workspace_keys.sql"),
      true,
    );

    const upgraded = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(upgraded.applied, []);
    assert.equal(upgraded.skipped.length, files.length);

    const ledger = await query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY filename");
    assert.deepEqual(
      ledger.map((row) => row.filename),
      files,
    );

    const again = await applySqlMigrations(db, { migrationsDir, logger: createLoggerStub() });
    assert.deepEqual(again.applied, []);
  });
});

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://okkey:okkey@127.0.0.1:5432/okkey";

async function skipIfPostgresDown(t: TestContext): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    t.skip(`Postgres unavailable (${message})`);
    return true;
  }
}

type SqlQuery = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

async function withSchema(
  run: (ctx: { db: PostgresDatabase; query: SqlQuery }) => Promise<void>,
): Promise<void> {
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
  const schema = `mig_num_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const query: SqlQuery = async <T>(sql: string, params: unknown[] = []) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  };
  const db = {
    async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      await client.query("BEGIN");
      try {
        const value = await fn({ query });
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
    await run({ db, query });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
}

async function tableExists(query: SqlQuery, table: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS exists
    `,
    [table],
  );
  return Boolean(rows[0]?.exists);
}

async function columnExists(query: SqlQuery, table: string, column: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [table, column],
  );
  return Boolean(rows[0]?.exists);
}
