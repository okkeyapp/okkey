import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "../logger.ts";
import type { PostgresDatabase, QueryExecutor } from "./postgres.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Stable advisory-lock key for SQL migrations (API + worker may start together).
 * Two-int form: class 0x4f4b4b59 ("OKKY"), object 1.
 */
export const SQL_MIGRATIONS_ADVISORY_LOCK_KEY1 = 0x4f4b4b59;
export const SQL_MIGRATIONS_ADVISORY_LOCK_KEY2 = 1;

export function defaultMigrationsDir(): string {
  return path.resolve(__dirname, "../../migrations");
}

export type ApplyMigrationsOptions = {
  migrationsDir?: string;
  logger?: Pick<Logger, "info" | "warn" | "error">;
};

/**
 * Apply SQL files under `services/api/migrations/` in lexical order.
 * Tracks applied files in `schema_migrations` (filename PK).
 *
 * Serialized with a transaction-scoped advisory lock so concurrent API/worker
 * startups on an empty database do not race on `schema_migrations_pkey`.
 */
export async function applySqlMigrations(
  db: PostgresDatabase,
  options: ApplyMigrationsOptions = {},
): Promise<{ applied: string[]; skipped: string[] }> {
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
  const logger = options.logger;

  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1, $2)", [
      SQL_MIGRATIONS_ADVISORY_LOCK_KEY1,
      SQL_MIGRATIONS_ADVISORY_LOCK_KEY2,
    ]);
    return applySqlMigrationsLocked(tx, migrationsDir, logger);
  });
}

async function applySqlMigrationsLocked(
  tx: QueryExecutor,
  migrationsDir: string,
  logger: ApplyMigrationsOptions["logger"],
): Promise<{ applied: string[]; skipped: string[] }> {
  await tx.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = await tx.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  const already = new Set(appliedRows.map((row) => row.filename));

  // Existing DBs created before schema_migrations: baseline without re-running SQL.
  if (already.size === 0) {
    const users = await tx.query<{ exists: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS exists",
    );
    if (users[0]?.exists) {
      logger?.warn("baselining schema_migrations for existing database", {
        count: files.length,
      });
      for (const filename of files) {
        await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        already.add(filename);
      }
    }
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of files) {
    if (already.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, filename), "utf8");
    logger?.info("applying migration", { filename });

    // Some migration files contain multiple statements; pg supports multi-statement queries.
    await tx.query(sql);
    await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);

    applied.push(filename);
  }

  if (applied.length > 0) {
    logger?.info("database migrations applied", { count: applied.length, applied });
  } else {
    logger?.info("database migrations up to date", { tracked: skipped.length });
  }

  return { applied, skipped };
}
