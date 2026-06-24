import type { IncomingMessage } from "node:http";
import type { AuthService } from "./auth/service.ts";
import type { RegistrationService } from "./registration/service.ts";
import type { ApiConfig } from "./config.ts";
import type { DeviceService } from "./device/service.ts";
import { getHeader, HttpApp } from "./http.ts";
import type { Logger } from "./logger.ts";
import { createCorsMiddleware } from "./middleware/cors.ts";
import { createErrorHandlerMiddleware } from "./middleware/error-handler.ts";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.ts";
import {
  createAuthEmailConfirmRoute,
  createAuthEmailResendRoute,
  createAuthEmailStartRoute,
} from "./routes/auth-email.ts";
import { createResolveAuthenticatedUserId } from "./routes/auth-context.ts";
import { createRegisterCompleteRoute } from "./routes/auth-register-complete.ts";
import { createAuthSessionBootstrapRoute } from "./routes/auth-session.ts";
import { healthRouteHandler } from "./routes/health.ts";
import { createReadyRouteHandler } from "./routes/ready.ts";
import {
  createApproveDeviceRoute,
  createRegisterDeviceRoute,
  createRejectDeviceRoute,
} from "./routes/devices.ts";
import {
  createSyncEventsAppendRoute,
  createSyncEventsListRoute,
} from "./routes/sync.ts";
import {
  createBackupCodesRegenerateRoute,
  createTotpEnrollConfirmRoute,
  createTotpEnrollStartRoute,
  createTwoFactorDisableRoute,
  createTwoFactorStatusRoute,
  createTwoFactorVerifyRoute,
} from "./routes/two-factor.ts";
import {
  createCapsuleCreateRoute,
  createCapsuleMetadataRoute,
  createCapsuleOpenRoute,
  createCapsuleRevokeRoute,
} from "./routes/capsules.ts";
import { createWorkspacesListRoute } from "./routes/workspaces-list.ts";
import {
  createVaultGetRoute,
  createWorkspaceVaultsListRoute,
} from "./routes/vault.ts";
import { createVaultUnlockBootstrapRoute } from "./routes/vault-unlock-bootstrap.ts";
import { createAccountProfileRoute } from "./routes/account-profile.ts";
import {
  createAccountEmailChangeConfirmRoute,
  createAccountEmailChangeResendRoute,
  createAccountEmailChangeStartRoute,
} from "./routes/account-email-change.ts";
import {
  createVaultKeyGetRoute,
  createVaultKeyRotateRoute,
  createVaultMemberRoleUpdateRoute,
  createVaultShareRevokeRoute,
  createVaultSharesListRoute,
  createVaultShareUpsertRoute,
} from "./routes/vault-sharing.ts";
import type { SessionService } from "./session/service.ts";
import type { SyncService } from "./sync/service.ts";
import type { TwoFactorService } from "./two-factor/service.ts";
import type { VaultService } from "./vault/service.ts";
import type { VaultSharingService } from "./vault-sharing/service.ts";
import type { CapsuleService } from "./capsule/service.ts";
import type { VaultUnlockBootstrapService } from "./account/vault-unlock-bootstrap.ts";
import type { UsersRepository } from "./storage/repositories.ts";
import type { EmailChangeService } from "./account/email-change.ts";
import type { KeyFieldFileStorage } from "./storage/key-field-file-storage.ts";
import {
  createDevKeyFieldFileDeleteRoute,
  createDevKeyFieldFileGetRoute,
  createDevKeyFieldFileUploadRoute,
} from "./routes/dev-key-field-files.ts";

export interface AppDeps {
  readyCheck?: () => Promise<void>;
  authService?: AuthService;
  registrationService?: RegistrationService;
  vaultService?: VaultService;
  vaultUnlockBootstrapService?: VaultUnlockBootstrapService;
  /** When set with `sessionService`, exposes account profile routes (Bearer). */
  usersRepository?: Pick<UsersRepository, "loadAccountProfile" | "updateAccountProfile">;
  emailChangeService?: EmailChangeService;
  vaultSharingService?: VaultSharingService;
  syncService?: SyncService;
  deviceService?: DeviceService;
  sessionService?: SessionService;
  twoFactorService?: TwoFactorService;
  capsuleService?: CapsuleService;
  keyFieldFileStorage?: KeyFieldFileStorage;
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

  const resolveUserId: (req: IncomingMessage) => Promise<string | null> =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedUserId(config, deps.sessionService)
      : async (req) => {
          const header = getHeader(req, "x-user-id");
          return header?.trim() ?? null;
        };

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
  if (deps.registrationService) {
    app.route(
      "POST",
      "/auth/register/complete",
      createRegisterCompleteRoute(deps.registrationService),
    );
  }
  if (deps.twoFactorService) {
    app.route(
      "POST",
      "/auth/session/bootstrap",
      createAuthSessionBootstrapRoute(deps.twoFactorService),
    );
    app.route(
      "POST",
      "/auth/two-factor/verify",
      createTwoFactorVerifyRoute(deps.twoFactorService),
    );
    app.route(
      "GET",
      "/auth/two-factor/status",
      createTwoFactorStatusRoute(deps.twoFactorService, resolveUserId),
    );
    app.route(
      "POST",
      "/auth/two-factor/totp/enroll/start",
      createTotpEnrollStartRoute(deps.twoFactorService, resolveUserId),
    );
    app.route(
      "POST",
      "/auth/two-factor/totp/enroll/confirm",
      createTotpEnrollConfirmRoute(deps.twoFactorService, resolveUserId),
    );
    app.route(
      "POST",
      "/auth/two-factor/backup-codes/regenerate",
      createBackupCodesRegenerateRoute(deps.twoFactorService, resolveUserId),
    );
    app.route(
      "POST",
      "/auth/two-factor/disable",
      createTwoFactorDisableRoute(deps.twoFactorService, resolveUserId),
    );
  }
  if (deps.vaultUnlockBootstrapService) {
    app.route(
      "GET",
      "/vault/unlock-bootstrap",
      createVaultUnlockBootstrapRoute(deps.vaultUnlockBootstrapService, resolveUserId),
    );
  }
  if (deps.sessionService !== undefined && deps.usersRepository) {
    app.route(
      "GET",
      "/account/profile",
      createAccountProfileRoute(deps.usersRepository, resolveUserId),
    );
    app.route(
      "PATCH",
      "/account/profile",
      createAccountProfileRoute(deps.usersRepository, resolveUserId),
    );
  }
  if (deps.sessionService !== undefined && deps.emailChangeService) {
    app.route(
      "POST",
      "/account/email-change/start",
      createAccountEmailChangeStartRoute(deps.emailChangeService, resolveUserId),
    );
    app.route(
      "POST",
      "/account/email-change/resend",
      createAccountEmailChangeResendRoute(deps.emailChangeService, resolveUserId),
    );
    app.route(
      "POST",
      "/account/email-change/confirm",
      createAccountEmailChangeConfirmRoute(deps.emailChangeService, resolveUserId),
    );
  }
  if (deps.vaultService) {
    app.route(
      "GET",
      "/workspaces",
      createWorkspacesListRoute(deps.vaultService, resolveUserId),
    );
    app.route(
      "GET",
      "/workspaces/:workspaceId/vaults",
      createWorkspaceVaultsListRoute(deps.vaultService, resolveUserId),
    );
    app.route(
      "GET",
      "/vaults/:vaultId",
      createVaultGetRoute(deps.vaultService, resolveUserId),
    );
  }
  if (deps.vaultSharingService) {
    app.route(
      "GET",
      "/vaults/:vaultId/key",
      createVaultKeyGetRoute(deps.vaultSharingService, resolveUserId),
    );
    app.route(
      "GET",
      "/vaults/:vaultId/shares",
      createVaultSharesListRoute(deps.vaultSharingService, resolveUserId),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/shares",
      createVaultShareUpsertRoute(deps.vaultSharingService, resolveUserId),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/shares/revoke",
      createVaultShareRevokeRoute(deps.vaultSharingService, resolveUserId),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/key/rotate",
      createVaultKeyRotateRoute(deps.vaultSharingService, resolveUserId),
    );
    app.route(
      "PATCH",
      "/vaults/:vaultId/shares/:userId",
      createVaultMemberRoleUpdateRoute(deps.vaultSharingService, resolveUserId),
    );
  }
  if (deps.syncService) {
    app.route(
      "GET",
      "/vaults/:vaultId/events",
      createSyncEventsListRoute(deps.syncService, resolveUserId),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/events",
      createSyncEventsAppendRoute(deps.syncService, resolveUserId),
    );
  }
  if (deps.deviceService) {
    app.route(
      "POST",
      "/devices/register",
      createRegisterDeviceRoute(deps.deviceService, resolveUserId),
    );
    app.route(
      "POST",
      "/devices/:deviceId/approve",
      createApproveDeviceRoute(deps.deviceService, resolveUserId),
    );
    app.route(
      "POST",
      "/devices/:deviceId/reject",
      createRejectDeviceRoute(deps.deviceService, resolveUserId),
    );
  }
  if (deps.capsuleService) {
    app.route(
      "POST",
      "/workspaces/:workspaceId/capsules",
      createCapsuleCreateRoute(deps.capsuleService, resolveUserId),
    );
    app.route("GET", "/capsules/:capsuleId", createCapsuleMetadataRoute(deps.capsuleService));
    app.route("POST", "/capsules/:capsuleId/open", createCapsuleOpenRoute(deps.capsuleService));
    app.route(
      "POST",
      "/capsules/:capsuleId/revoke",
      createCapsuleRevokeRoute(deps.capsuleService, resolveUserId),
    );
  }
  if (deps.keyFieldFileStorage) {
    app.route(
      "POST",
      "/dev/key-field-files",
      createDevKeyFieldFileUploadRoute(deps.keyFieldFileStorage, config),
    );
    app.route(
      "GET",
      "/dev/key-field-files/:attachmentId",
      createDevKeyFieldFileGetRoute(deps.keyFieldFileStorage, config),
    );
    app.route(
      "DELETE",
      "/dev/key-field-files/:attachmentId",
      createDevKeyFieldFileDeleteRoute(deps.keyFieldFileStorage, config),
    );
  }

  return app;
}
