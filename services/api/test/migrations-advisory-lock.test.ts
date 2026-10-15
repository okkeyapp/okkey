import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { loadConfig } from "../src/config.ts";
import { PostgresDatabase } from "../src/storage/postgres.ts";
import {
  applySqlMigrations,
  SQL_MIGRATIONS_ADVISORY_LOCK_KEY1,
  SQL_MIGRATIONS_ADVISORY_LOCK_KEY2,
} from "../src/storage/migrate.ts";

function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

type PgClient = {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};

async function probePostgres(databaseUrl: string): Promise<boolean> {
  try {
    const pgModule = (await import("pg")) as {
      Client: new (opts: {
        connectionString: string;
        connectionTimeoutMillis?: number;
      }) => PgClient;
    };
    const client = new pgModule.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 1500,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return true;
    } finally {
      await client.end();
    }
  } catch {
    return false;
  }
}

async function createTempDatabase(
  t: TestContext,
): Promise<{ databaseUrl: string } | null> {
  let databaseUrl: string;
  try {
    databaseUrl = loadConfig().databaseUrl;
  } catch (error) {
    t.skip(`config unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  if (!(await probePostgres(databaseUrl))) {
    t.skip("Postgres unavailable");
    return null;
  }

  const admin = await PostgresDatabase.connect(databaseUrl);
  const dbName = `okkey_mig_lock_${Date.now().toString(36)}`;

  t.after(async () => {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    } finally {
      await admin.close();
    }
  });

  try {
    await admin.query(`CREATE DATABASE ${dbName}`);
  } catch (error) {
    t.skip(`CREATE DATABASE unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return { databaseUrl: url.toString() };
}

function writeTinyMigrationsDir(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "okkey-mig-lock-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  writeFileSync(
    path.join(dir, "0001_init.sql"),
    `
      CREATE TABLE IF NOT EXISTS race_probe (
        id int PRIMARY KEY
      );
      INSERT INTO race_probe (id) VALUES (1);
    `,
    "utf8",
  );
  return dir;
}

test("applySqlMigrations waits on the migrations advisory lock", async (t) => {
  const created = await createTempDatabase(t);
  if (!created) {
    return;
  }

  const dir = writeTinyMigrationsDir(t);
  const pgModule = (await import("pg")) as {
    Client: new (opts: { connectionString: string }) => PgClient;
  };
  const locker = new pgModule.Client({ connectionString: created.databaseUrl });
  await locker.connect();
  t.after(async () => {
    await locker.end();
  });

  await locker.query("SELECT pg_advisory_lock($1, $2)", [
    SQL_MIGRATIONS_ADVISORY_LOCK_KEY1,
    SQL_MIGRATIONS_ADVISORY_LOCK_KEY2,
  ]);

  const db = await PostgresDatabase.connect(created.databaseUrl);
  t.after(async () => {
    await db.close();
  });

  let finished = false;
  const migratePromise = applySqlMigrations(db, {
    migrationsDir: dir,
    logger: createLoggerStub(),
  }).then((result) => {
    finished = true;
    return result;
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(finished, false);

  await locker.query("SELECT pg_advisory_unlock($1, $2)", [
    SQL_MIGRATIONS_ADVISORY_LOCK_KEY1,
    SQL_MIGRATIONS_ADVISORY_LOCK_KEY2,
  ]);

  const result = await migratePromise;
  assert.deepEqual(result.applied, ["0001_init.sql"]);
  assert.deepEqual(result.skipped, []);
});

test("concurrent applySqlMigrations on empty database do not conflict", async (t) => {
  const created = await createTempDatabase(t);
  if (!created) {
    return;
  }

  const dir = writeTinyMigrationsDir(t);
  const left = await PostgresDatabase.connect(created.databaseUrl);
  const right = await PostgresDatabase.connect(created.databaseUrl);
  t.after(async () => {
    await Promise.allSettled([left.close(), right.close()]);
  });

  const [a, b] = await Promise.all([
    applySqlMigrations(left, { migrationsDir: dir, logger: createLoggerStub() }),
    applySqlMigrations(right, { migrationsDir: dir, logger: createLoggerStub() }),
  ]);

  const appliedTotal = a.applied.length + b.applied.length;
  const skippedTotal = a.skipped.length + b.skipped.length;
  assert.equal(appliedTotal, 1);
  assert.equal(skippedTotal, 1);

  const rows = await left.query<{ count: string }>("SELECT count(*)::text AS count FROM race_probe");
  assert.equal(rows[0]?.count, "1");

  const ledger = await left.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  assert.deepEqual(
    ledger.map((row) => row.filename),
    ["0001_init.sql"],
  );
});
