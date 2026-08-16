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
  createCapsuleApprovalRequestRoute,
  createCapsuleApprovalResolveRoute,
  createCapsuleApprovalStatusRoute,
  createCapsuleCreateRoute,
  createCapsuleDeleteRoute,
  createCapsuleMetadataRoute,
  createCapsuleOpenRoute,
  createCapsuleOwnerListRoute,
  createCapsulePendingApprovalsRoute,
  createCapsuleRevokeRoute,
  createCapsuleStateRoute,
} from "./routes/capsules.ts";
import {
  createWorkspaceItemCategoryPreferencesRoute,
} from "./routes/workspace-item-category-preferences.ts";
import {
  createWorkspaceItemTemplatesCreateRoute,
  createWorkspaceItemTemplatesDeleteRoute,
  createWorkspaceItemTemplatesListRoute,
  createWorkspaceItemTemplatesUpdateRoute,
} from "./routes/workspace-item-templates.ts";
import { createWorkspaceSettingsRoute } from "./routes/workspace-settings.ts";
import { createWorkspaceBuiltInRolesListRoute } from "./routes/workspace-built-in-roles.ts";
import { createWorkspaceBuiltInProfilesListRoute } from "./routes/workspace-built-in-profiles.ts";
import type { ApiEnterprisePlugin, ApiEnterprisePluginContext } from "./plugins/types.ts";
import type { QueryExecutor } from "./storage/postgres.ts";
import type { WorkspaceBuiltInRolesService } from "./workspace-roles/list-service.ts";
import type { WorkspaceBuiltInProfilesService } from "./workspace-profiles/list-service.ts";
import type { EmailChangeService } from "./account/email-change.ts";
import type { WorkspacesRepository } from "./storage/repositories.ts";
import {
  createWorkspacePersonalEventsAppendRoute,
  createWorkspacePersonalEventsListRoute,
} from "./routes/workspace-personal-sync.ts";
import { createWorkspacesListRoute } from "./routes/workspaces-list.ts";
import {
  createVaultGetRoute,
  createVaultUpdateRoute,
  createWorkspaceVaultsListRoute,
} from "./routes/vault.ts";
import { createWorkspaceMembersListRoute, createWorkspaceMemberDirectoryRoute } from "./routes/workspace-members.ts";
import { createWorkspaceMePermissionsRoute } from "./routes/workspace-me-permissions.ts";
import {
  createWorkspaceMeVaultProfilesRoute,
  WorkspaceMeVaultProfilesService,
} from "./routes/workspace-me-vault-profiles.ts";
import type { WorkspaceMembersService } from "./workspace-members/service.ts";
import { createVaultUnlockBootstrapRoute } from "./routes/vault-unlock-bootstrap.ts";
import { createAccountVaultUnlockRoute } from "./routes/account-vault-unlock.ts";
import { createAccountProfileRoute } from "./routes/account-profile.ts";
import {
  createAccountEmailChangeConfirmRoute,
  createAccountEmailChangeResendRoute,
  createAccountEmailChangeStartRoute,
} from "./routes/account-email-change.ts";
import { createVaultKeyGetRoute } from "./routes/vault-sharing.ts";
import type { SessionService } from "./session/service.ts";
import type { SyncService } from "./sync/service.ts";
import type { WorkspacePersonalSyncService } from "./workspace-personal-sync/service.ts";
import type { TwoFactorService } from "./two-factor/service.ts";
import type { VaultService } from "./vault/service.ts";
import type { VaultSharingService } from "./vault-sharing/service.ts";
import type { CapsuleService } from "./capsule/service.ts";
import type { ItemCategoryPreferencesService } from "./item-category-preferences/service.ts";
import type { ItemTemplatesService } from "./item-templates/service.ts";
import type { WorkspaceSettingsService } from "./workspace-settings/service.ts";
import type { VaultUnlockBootstrapService } from "./account/vault-unlock-bootstrap.ts";
import type { UsersRepository } from "./storage/repositories.ts";
import type { AttachmentService } from "./attachments/service.ts";
import type { ItemFaviconService } from "./favicon/service.ts";
import {
  createAttachmentDeleteRoute,
  createAttachmentDownloadRoute,
  createAttachmentUploadRoute,
} from "./routes/attachments.ts";
import { createItemFaviconPreviewRoute } from "./routes/item-favicons.ts";

export interface CreateApiAppOptions {
  enterprisePlugins?: ApiEnterprisePlugin[];
  postgres?: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  workspacesRepository?: Pick<
    WorkspacesRepository,
    "findById" | "hasAccess" | "create" | "countOwnedByUser" | "listByOwner" | "listAccessibleByUser"
  >;
  vaultsRepository?: ApiEnterprisePluginContext["repositories"]["vaults"];
  emailTemplates?: ApiEnterprisePluginContext["emailTemplates"];
  publicAppBaseUrl?: string;
  redis?: ApiEnterprisePluginContext["redis"];
}

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
  itemCategoryPreferencesService?: ItemCategoryPreferencesService;
  itemTemplatesService?: ItemTemplatesService;
  workspaceSettingsService?: WorkspaceSettingsService;
  workspaceBuiltInRolesService?: WorkspaceBuiltInRolesService;
  workspaceBuiltInProfilesService?: WorkspaceBuiltInProfilesService;
  workspaceMeVaultProfilesService?: WorkspaceMeVaultProfilesService;
  workspaceMembersService?: WorkspaceMembersService;
  workspacePersonalSyncService?: WorkspacePersonalSyncService;
  attachmentService?: AttachmentService;
  itemFaviconService?: ItemFaviconService;
}

export function createApiApp(
  config: ApiConfig,
  logger: Logger,
  deps: AppDeps = {},
  options: CreateApiAppOptions = {},
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
    app.route(
      "POST",
      "/account/vault-unlock",
      createAccountVaultUnlockRoute(deps.usersRepository, resolveUserId),
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
  const enterprisePlugins = options.enterprisePlugins ?? [];

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
    if (options.postgres) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/me/permissions",
        createWorkspaceMePermissionsRoute(options.postgres, resolveUserId),
      );
      if (deps.workspaceMeVaultProfilesService) {
        app.route(
          "GET",
          "/workspaces/:workspaceId/me/vault-profiles",
          createWorkspaceMeVaultProfilesRoute(deps.workspaceMeVaultProfilesService, resolveUserId),
        );
      }
    }
    // Shared vault create is registered by enterprise `workspace-shared-vaults` plugin only.
    if (deps.workspaceMembersService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/members",
        createWorkspaceMembersListRoute(deps.workspaceMembersService, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/member-directory",
        createWorkspaceMemberDirectoryRoute(deps.workspaceMembersService, resolveUserId),
      );
      // Invite / member mutation / vault-access routes: enterprise `workspace-members` plugin only.
    }
    if (deps.itemCategoryPreferencesService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/item-category-preferences",
        createWorkspaceItemCategoryPreferencesRoute(deps.itemCategoryPreferencesService, resolveUserId),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/item-category-preferences",
        createWorkspaceItemCategoryPreferencesRoute(deps.itemCategoryPreferencesService, resolveUserId),
      );
    }
    if (deps.itemTemplatesService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/item-templates",
        createWorkspaceItemTemplatesListRoute(deps.itemTemplatesService, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/item-templates",
        createWorkspaceItemTemplatesCreateRoute(deps.itemTemplatesService, resolveUserId),
      );
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/item-templates/:templateId",
        createWorkspaceItemTemplatesDeleteRoute(deps.itemTemplatesService, resolveUserId),
      );
      app.route(
        "PATCH",
        "/workspaces/:workspaceId/item-templates/:templateId",
        createWorkspaceItemTemplatesUpdateRoute(deps.itemTemplatesService, resolveUserId),
      );
    }
    if (deps.workspaceSettingsService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/settings",
        createWorkspaceSettingsRoute(deps.workspaceSettingsService, resolveUserId),
      );
      app.route(
        "PATCH",
        "/workspaces/:workspaceId/settings",
        createWorkspaceSettingsRoute(deps.workspaceSettingsService, resolveUserId),
      );
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/settings",
        createWorkspaceSettingsRoute(deps.workspaceSettingsService, resolveUserId),
      );
    }
    const hasEnterpriseWorkspaceRoles = enterprisePlugins.some(
      (plugin) => plugin.id === "workspace-roles",
    );
    if (!hasEnterpriseWorkspaceRoles && deps.workspaceBuiltInRolesService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/roles",
        createWorkspaceBuiltInRolesListRoute(deps.workspaceBuiltInRolesService, resolveUserId),
      );
    }
    const hasEnterpriseWorkspaceProfiles = enterprisePlugins.some(
      (plugin) => plugin.id === "workspace-profiles",
    );
    if (!hasEnterpriseWorkspaceProfiles && deps.workspaceBuiltInProfilesService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/profiles",
        createWorkspaceBuiltInProfilesListRoute(deps.workspaceBuiltInProfilesService, resolveUserId),
      );
    }
    if (deps.workspacePersonalSyncService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/personal-events",
        createWorkspacePersonalEventsListRoute(deps.workspacePersonalSyncService, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/personal-events",
        createWorkspacePersonalEventsAppendRoute(deps.workspacePersonalSyncService, resolveUserId),
      );
    }
    app.route(
      "GET",
      "/vaults/:vaultId",
      createVaultGetRoute(deps.vaultService, resolveUserId),
    );
    app.route(
      "PATCH",
      "/vaults/:vaultId",
      createVaultUpdateRoute(deps.vaultService, resolveUserId),
    );
    // Shared vault delete / access routes: enterprise `workspace-shared-vaults` plugin only.
  }
  if (deps.vaultSharingService) {
    app.route(
      "GET",
      "/vaults/:vaultId/key",
      createVaultKeyGetRoute(deps.vaultSharingService, resolveUserId),
    );
    // Shares / rotate / member-role routes: enterprise `workspace-shared-vaults` plugin only.
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
      "GET",
      "/workspaces/:workspaceId/capsules",
      createCapsuleOwnerListRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "POST",
      "/workspaces/:workspaceId/capsules",
      createCapsuleCreateRoute(deps.capsuleService, resolveUserId),
    );
    app.route("GET", "/capsules/:capsuleId", createCapsuleMetadataRoute(deps.capsuleService));
    app.route(
      "POST",
      "/capsules/:capsuleId/open",
      createCapsuleOpenRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "POST",
      "/capsules/:capsuleId/revoke",
      createCapsuleRevokeRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "PATCH",
      "/capsules/:capsuleId/state",
      createCapsuleStateRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "DELETE",
      "/capsules/:capsuleId",
      createCapsuleDeleteRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "POST",
      "/capsules/:capsuleId/approval-requests",
      createCapsuleApprovalRequestRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "GET",
      "/capsule-approval-requests/:requestId",
      createCapsuleApprovalStatusRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "GET",
      "/capsule-approval-requests",
      createCapsulePendingApprovalsRoute(deps.capsuleService, resolveUserId),
    );
    app.route(
      "POST",
      "/capsule-approval-requests/:requestId/resolve",
      createCapsuleApprovalResolveRoute(deps.capsuleService, resolveUserId),
    );
  }
  if (deps.attachmentService) {
    app.route(
      "POST",
      "/vaults/:vaultId/items/:itemId/attachments",
      createAttachmentUploadRoute(deps.attachmentService, resolveUserId),
    );
    app.route(
      "GET",
      "/vaults/:vaultId/items/:itemId/attachments/:attachmentId",
      createAttachmentDownloadRoute(deps.attachmentService, resolveUserId),
    );
    app.route(
      "DELETE",
      "/vaults/:vaultId/items/:itemId/attachments/:attachmentId",
      createAttachmentDeleteRoute(deps.attachmentService, resolveUserId),
    );
  }

  if (deps.itemFaviconService) {
    app.route(
      "POST",
      "/favicon/preview",
      createItemFaviconPreviewRoute(deps.itemFaviconService, resolveUserId),
    );
  }

  if (options.postgres && options.workspacesRepository) {
    for (const plugin of enterprisePlugins) {
      plugin.register({
        app,
        config,
        resolveUserId,
        postgres: options.postgres,
        redis: options.redis,
        publicAppBaseUrl: options.publicAppBaseUrl ?? config.publicAppBaseUrl,
        emailTemplates: options.emailTemplates,
        repositories: {
          workspaces: options.workspacesRepository,
          vaults: options.vaultsRepository,
        },
        services: {
          vaultSharingService: deps.vaultSharingService,
        },
      });
    }
  }

  return app;
}
