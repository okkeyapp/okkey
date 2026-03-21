import type { ApiConfig } from "./config.ts";
import { HttpApp } from "./http.ts";
import type { Logger } from "./logger.ts";
import { createCorsMiddleware } from "./middleware/cors.ts";
import { createErrorHandlerMiddleware } from "./middleware/error-handler.ts";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.ts";
import { healthRouteHandler } from "./routes/health.ts";
import { createReadyRouteHandler } from "./routes/ready.ts";

export function createApiApp(
  config: ApiConfig,
  logger: Logger,
  readyCheck: () => Promise<void> = async () => {},
): HttpApp {
  const app = new HttpApp();

  app.use(createErrorHandlerMiddleware(logger));
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use(createRequestLoggerMiddleware(logger));

  app.route("GET", "/health", healthRouteHandler);
  app.route("GET", "/ready", createReadyRouteHandler(readyCheck));

  return app;
}
