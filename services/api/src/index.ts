import { AuthService } from "./auth/service.ts";
import { RegistrationService } from "./registration/service.ts";
import { createServer } from "node:http";
import { createApiApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { DeviceService } from "./device/service.ts";
import { createEmailSender, EmailTemplateService } from "./email/service.ts";
import { createLogger } from "./logger.ts";
import { createStorageLayer } from "./storage/index.ts";
import { SyncService } from "./sync/service.ts";
import { VaultService } from "./vault/service.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const storage = await createStorageLayer(config, logger);
  const emailSender = await createEmailSender(config, logger);
  const emailTemplates = new EmailTemplateService(
    emailSender,
    config.emailFrom,
    config.defaultEmailLocale,
  );
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });
  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    config,
  });
  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
  });
  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
  });
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
  });
  const app = createApiApp(config, logger, {
    readyCheck: () => storage.ping(),
    authService,
    registrationService,
    vaultService,
    syncService,
    deviceService,
  });

  const server = createServer(app.handler());
  server.listen(config.port, () => {
    logger.info("api server started", {
      nodeEnv: config.nodeEnv,
      port: config.port,
      logLevel: config.logLevel,
    });
  });

  const shutdown = async () => {
    logger.info("api server stopping");
    server.close();
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
  logger.error("api server failed to start", {
    error: error instanceof Error ? error.message : "unknown error",
  });
  process.exitCode = 1;
});
