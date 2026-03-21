import { createServer } from "node:http";
import { createApiApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";

const config = loadConfig();
const logger = createLogger();
const app = createApiApp(config, logger);

const server = createServer(app.handler());
server.listen(config.port, () => {
  logger.info("api server started", {
    nodeEnv: config.nodeEnv,
    port: config.port,
    logLevel: config.logLevel,
  });
});
