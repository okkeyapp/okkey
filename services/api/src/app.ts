import type { AuthService } from "./auth/service.ts";
import type { ApiConfig } from "./config.ts";
import { HttpApp } from "./http.ts";
import type { Logger } from "./logger.ts";
import { createCorsMiddleware } from "./middleware/cors.ts";
import { createErrorHandlerMiddleware } from "./middleware/error-handler.ts";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.ts";
import {
  createAuthEmailConfirmRoute,
  createAuthEmailResendRoute,
  createAuthEmailStartRoute,
} from "./routes/auth-email.ts";
import { healthRouteHandler } from "./routes/health.ts";
import { createReadyRouteHandler } from "./routes/ready.ts";
import {
  createSyncEventsAppendRoute,
  createSyncEventsListRoute,
} from "./routes/sync.ts";
import {
  createVaultGetRoute,
  createWorkspaceVaultsListRoute,
} from "./routes/vault.ts";
import type { SyncService } from "./sync/service.ts";
import type { VaultService } from "./vault/service.ts";

export interface AppDeps {
  readyCheck?: () => Promise<void>;
  authService?: AuthService;
  vaultService?: VaultService;
  syncService?: SyncService;
}

export function createApiApp(
  config: ApiConfig,
  logger: Logger,
  deps: AppDeps = {},
): HttpApp {
  const app = new HttpApp();
  const readyCheck = deps.readyCheck ?? (async () => {});

  app.use(createErrorHandlerMiddleware(logger));
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use(createRequestLoggerMiddleware(logger));

  app.route("GET", "/health", healthRouteHandler);
  app.route("GET", "/ready", createReadyRouteHandler(readyCheck));
  if (deps.authService) {
    app.route("POST", "/auth/email/start", createAuthEmailStartRoute(deps.authService));
    app.route("POST", "/auth/email/resend", createAuthEmailResendRoute(deps.authService));
    app.route(
      "POST",
      "/auth/email/confirm",
      createAuthEmailConfirmRoute(deps.authService),
    );
  }
  if (deps.vaultService) {
    app.route(
      "GET",
      "/workspaces/:workspaceId/vaults",
      createWorkspaceVaultsListRoute(deps.vaultService),
    );
    app.route("GET", "/vaults/:vaultId", createVaultGetRoute(deps.vaultService));
  }
  if (deps.syncService) {
    app.route("GET", "/vaults/:vaultId/events", createSyncEventsListRoute(deps.syncService));
    app.route(
      "POST",
      "/vaults/:vaultId/events",
      createSyncEventsAppendRoute(deps.syncService),
    );
  }

  return app;
}
