import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "../logger.ts";
import type { PostgresDatabase } from "./postgres.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 */
export async function applySqlMigrations(
  db: PostgresDatabase,
  options: ApplyMigrationsOptions = {},
): Promise<{ applied: string[]; skipped: string[] }> {
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
  const logger = options.logger;

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const appliedRows = await db.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  const already = new Set(appliedRows.map((row) => row.filename));

  // Existing DBs created before schema_migrations: baseline without re-running SQL.
  if (already.size === 0) {
    const users = await db.query<{ exists: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS exists",
    );
    if (users[0]?.exists) {
      logger?.warn("baselining schema_migrations for existing database", {
        count: files.length,
      });
      for (const filename of files) {
        await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
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

    await db.transaction(async (tx) => {
      // Some migration files contain multiple statements; pg supports multi-statement queries.
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });

    applied.push(filename);
  }

  if (applied.length > 0) {
    logger?.info("database migrations applied", { count: applied.length, applied });
  } else {
    logger?.info("database migrations up to date", { tracked: skipped.length });
  }

  return { applied, skipped };
}
