import { createServer } from "node:http";
import { createApiApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createStorageLayer } from "./storage/index.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger();
  const storage = await createStorageLayer(config, logger);
  const app = createApiApp(config, logger, () => storage.ping());

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
