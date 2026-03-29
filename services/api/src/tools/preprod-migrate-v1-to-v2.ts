import { loadConfig } from "../config.ts";
import { createLogger } from "../logger.ts";
import { PostgresDatabase } from "../storage/postgres.ts";
import {
  assertPreprodMigrationEnvironmentAllowed,
  parsePreprodMigrationCliArgs,
  PostgresPreprodMigrationAdapter,
  PreprodMigrationError,
  runPreprodMigration,
} from "./preprod-migration.ts";

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const options = parsePreprodMigrationCliArgs(process.argv.slice(2));
  const allowProdOverride = parseBoolean(process.env.INTERNAL_PREPROD_MIGRATION_ALLOW_PROD);

  assertPreprodMigrationEnvironmentAllowed({
    nodeEnv: config.nodeEnv,
    deployEnv: config.deployEnv,
    allowProdOverride,
  });

  const db = await PostgresDatabase.connect(config.databaseUrl);
  try {
    const adapter = new PostgresPreprodMigrationAdapter(db);
    const report = await runPreprodMigration(adapter, options);
    logger.info("preprod migration completed", report as unknown as Record<string, unknown>);
  } finally {
    await db.close();
  }
}

void main().catch((error: unknown) => {
  const logger = createLogger();
  const code =
    error instanceof PreprodMigrationError
      ? error.code
      : "PREPROD_MIGRATION_UNEXPECTED_ERROR";
  logger.error("preprod migration failed", {
    code,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
