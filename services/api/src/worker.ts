/**
 * Okkey worker process — background jobs (item purge, capsule cleanup).
 *
 * Run locally: `yarn dev:worker` (loads `services/api/.env` via loadConfig;
 * optional overrides in `services/worker/.env` are loaded first if present).
 *
 * Docker: same image as API with `CMD` pointing at this entrypoint.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AttachmentService } from "./attachments/service.ts";
import { CapsuleService } from "./capsule/service.ts";
import { MmdbGeoIpLookup } from "./capsule/geoip.ts";
import { loadConfig } from "./config.ts";
import { initEntityIdGenerator } from "./entity-id.ts";
import { ItemPurgeService } from "./item-purge/service.ts";
import { startBackgroundJobs } from "./jobs/background-jobs.ts";
import { createLogger } from "./logger.ts";
import { createStorageLayer } from "./storage/index.ts";
import {
  KeyFieldFileStorage,
  loadKeyFieldFileStorageConfigFromEnv,
} from "./storage/key-field-file-storage.ts";
import { applySqlMigrations } from "./storage/migrate.ts";

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../worker");

function loadWorkerEnvFile(): void {
  const filePath = path.join(workerDir, ".env");
  if (!existsSync(filePath)) {
    return;
  }
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = rawValue;
    }
  }
}

async function main(): Promise<void> {
  loadWorkerEnvFile();
  const config = loadConfig();
  initEntityIdGenerator(config.snowflakeNodeId);
  const logger = createLogger();
  const storage = await createStorageLayer(config, logger);

  // Worker can apply migrations if it starts before API (compose race); idempotent.
  await applySqlMigrations(storage.postgres, { logger });

  const geoIp = new MmdbGeoIpLookup(config.geoIpEnabled, config.geoIpDbPath, logger);
  const capsuleService = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    users: storage.repositories.users,
    objectStorage: storage.objectStorage,
    geoIp,
    config,
    log: logger,
  });

  const keyFieldFileStorageConfig = loadKeyFieldFileStorageConfigFromEnv();
  const keyFieldFileStorage = keyFieldFileStorageConfig
    ? new KeyFieldFileStorage(keyFieldFileStorageConfig)
    : undefined;
  if (keyFieldFileStorage) {
    await keyFieldFileStorage.ensureBucket();
  }

  const attachmentService = keyFieldFileStorage
    ? new AttachmentService({
        storage: keyFieldFileStorage,
        attachments: storage.repositories.attachments,
        vaults: storage.repositories.vaults,
        workspaces: storage.repositories.workspaces,
      })
    : undefined;

  const itemPurgeService = new ItemPurgeService({
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
    attachments: attachmentService,
  });

  const jobs = startBackgroundJobs({
    itemPurgeService,
    capsuleService,
    logger,
  });

  logger.info("worker started", {
    nodeEnv: config.nodeEnv,
    jobs: ["item-purge", "capsule-cleanup"],
  });

  const shutdown = async () => {
    logger.info("worker stopping");
    jobs.stop();
    await storage.close();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error: unknown) => {
  const logger = createLogger();
  logger.error("worker failed to start", {
    error: error instanceof Error ? error.message : "unknown error",
  });
  process.exitCode = 1;
});
