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
 * Ordered schema fingerprints for databases created before `schema_migrations`.
 * v1.0.0-beta.1 applied `0001`–`0034` with psql and had no migrator.
 * The walk stops at the first missing marker so later files are executed.
 */
export const PRE_LEDGER_CHECKPOINTS = [
  "0034_backup_codes_exported_at.sql",
  "0035_personal_data_bootstrap_dismissed.sql",
  "0036_attachment_purpose.sql",
  "0040_workspace_plan_change_request_sent.sql",
  "0041_session_scope.sql",
  "0042_events_item_soft_deleted.sql",
  "0043_recovery_possession.sql",
] as const;

export function preLedgerBaselineFilenames(
  files: readonly string[],
  checkpointPresent: (filename: string) => boolean,
): string[] {
  let through: string | null = null;
  for (const filename of PRE_LEDGER_CHECKPOINTS) {
    if (!files.includes(filename)) {
      continue;
    }
    if (!checkpointPresent(filename)) {
      break;
    }
    through = filename;
  }
  if (!through) {
    return [];
  }
  return files.filter((name) => name.localeCompare(through) <= 0);
}

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

  // Databases created before schema_migrations (v1.0.0-beta.1 applied 0001–0034 by psql).
  // Record only the prefix the live schema actually matches, then run the rest.
  if (already.size === 0) {
    const users = await tx.query<{ exists: boolean }>(
      "SELECT to_regclass(current_schema() || '.users') IS NOT NULL AS exists",
    );
    if (users[0]?.exists) {
      const present = await probePreLedgerCheckpoints(tx);
      const baseline = preLedgerBaselineFilenames(files, (filename) => present.has(filename));
      if (baseline.length === 0) {
        throw new Error(
          "database has users but no schema_migrations and does not match a known release schema; refusing to mark migrations as applied",
        );
      }
      logger?.warn("baselining schema_migrations for existing database", {
        through: baseline[baseline.length - 1],
        count: baseline.length,
      });
      for (const filename of baseline) {
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

async function columnExists(
  tx: QueryExecutor,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await tx.query<{ exists: boolean }>(
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

/** Checkpoints whose marker column is already in the current schema. */
async function probePreLedgerCheckpoints(tx: QueryExecutor): Promise<Set<string>> {
  const probes: Array<[string, string, string]> = [
    ["0034_backup_codes_exported_at.sql", "user_totp_credentials", "backup_codes_exported_at"],
    [
      "0035_personal_data_bootstrap_dismissed.sql",
      "workspace_member_item_category_preferences",
      "personal_data_bootstrap_dismissed",
    ],
    ["0036_attachment_purpose.sql", "attachments", "purpose"],
    ["0040_workspace_plan_change_request_sent.sql", "workspaces", "plan_change_request_sent_at"],
    ["0041_session_scope.sql", "sessions", "scope"],
    ["0042_events_item_soft_deleted.sql", "events", "item_soft_deleted"],
    ["0043_recovery_possession.sql", "sessions", "recovery_proved_at"],
  ];
  const present = new Set<string>();
  for (const [filename, table, column] of probes) {
    if (await columnExists(tx, table, column)) {
      present.add(filename);
    }
  }
  return present;
}
