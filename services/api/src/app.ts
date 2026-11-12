import type { IncomingMessage } from "node:http";
import type { AuthService } from "./auth/service.ts";
import type { RegistrationService } from "./registration/service.ts";
import type { ApiConfig } from "./config.ts";
import type { DeviceService } from "./device/service.ts";
import { registerCapsuleAccessSettingsProvider } from "./capsule/access-settings-provider.ts";
import { getHeader, HttpApp, type RouteHandler } from "./http.ts";
import type { Logger } from "./logger.ts";
import { createCorsMiddleware } from "./middleware/cors.ts";
import { createErrorHandlerMiddleware } from "./middleware/error-handler.ts";
import { createRequestLoggerMiddleware } from "./middleware/request-logger.ts";
import {
  createAuthEmailConfirmRoute,
  createAuthEmailResendRoute,
  createAuthEmailStartRoute,
} from "./routes/auth-email.ts";
import {
  createResolveAuthenticatedSession,
  createResolveAuthenticatedUserId,
} from "./routes/auth-context.ts";
import { isFullSessionScope, REGISTRATION_RECOVERY_ALLOWED_SCOPES } from "./session/scopes.ts";
import { createRegisterCompleteRoute } from "./routes/auth-register-complete.ts";
import { createAuthSessionBootstrapRoute } from "./routes/auth-session.ts";
import {
  createExtensionAuthIssueCodeRoute,
  createExtensionAuthTokenRoute,
} from "./routes/auth-extension.ts";
import type { ExtensionAuthService } from "./extension-auth/service.ts";
import { healthRouteHandler } from "./routes/health.ts";
import { createReadyRouteHandler } from "./routes/ready.ts";
import {
  createApproveDeviceRoute,
  createConfirmShareDeliveryRoute,
  createGetShareDeliveryRoute,
  createBlockDeviceRoute,
  createListDevicesRoute,
  createPatchDeviceRoute,
  createBindDeviceSessionRoute,
  createDeviceBindChallengeRoute,
  createRequestDeviceKeyRebindRoute,
  createRegisterDeviceRoute,
  createRejectDeviceRoute,
  createRevokeDeviceRoute,
  createUnblockDeviceRoute,
} from "./routes/devices.ts";
import {
  createAccountRecoveryKeyAckExportRoute,
  createAccountRecoveryKeyEnrollRoute,
  createAccountRecoveryKeyProveRoute,
  createAccountRecoveryKeyRotateRoute,
  createAccountRecoveryKeyWrapRoute,
  createAccountRecoveryIdentityEncryptedKeyRoute,
  createAccountRecoverySettingsPatchRoute,
  createAccountRecoveryStatusRoute,
} from "./routes/account-recovery.ts";
import type { AccountRecoveryService } from "./account-recovery/service.ts";
import {
  createSyncEventsAppendRoute,
  createSyncEventsListRoute,
} from "./routes/sync.ts";
import {
  createBackupCodesAckExportRoute,
  createBackupCodesRegenerateRoute,
  createTotpEnrollConfirmRoute,
  createTotpEnrollStartRoute,
  createTwoFactorDisableRoute,
  createTwoFactorStatusRoute,
  createTwoFactorVerifyRoute,
} from "./routes/two-factor.ts";
import {
  createAuthLoginDiscoverRoute,
  createLoginMethodsGetRoute,
  createLoginMethodsPrimaryPatchRoute,
  createWebAuthnCredentialDeleteRoute,
  createWebAuthnCredentialsBulkDeleteRoute,
  createWebAuthnLoginOptionsRoute,
  createWebAuthnLoginVerifyRoute,
  createWebAuthnRegisterOptionsRoute,
  createWebAuthnRegisterVerifyRoute,
} from "./routes/webauthn.ts";
import {
  createCapsuleCreateRoute,
  createCapsuleDeleteRoute,
  createCapsuleMetadataRoute,
  createCapsuleOpenRoute,
  createCapsuleOwnerListRoute,
  createCapsuleRevokeRoute,
  createCapsuleStateRoute,
  createCapsuleOwnerDetailRoute,
  createCapsuleUpdateRoute,
} from "./routes/capsules.ts";
import {
  createWorkspaceItemCategoryPreferencesRoute,
} from "./routes/workspace-item-category-preferences.ts";
import { createWorkspaceCapsuleDefaultsRoute } from "./routes/workspace-capsule-defaults.ts";
import {
  createWorkspaceItemTemplatesCreateRoute,
  createWorkspaceItemTemplatesDeleteRoute,
  createWorkspaceItemTemplatesListRoute,
  createWorkspaceItemTemplatesUpdateRoute,
} from "./routes/workspace-item-templates.ts";
import { createWorkspaceSettingsRoute } from "./routes/workspace-settings.ts";
import {
  createWorkspacePlanChangeRequestRoute,
  createWorkspacePlanChangeRequestStatusRoute,
} from "./routes/workspace-plan-change-request.ts";
import {
  createWorkspaceBuiltInRolesListRoute,
  createWorkspaceCustomRoleDeleteRoute,
} from "./routes/workspace-built-in-roles.ts";
import {
  createWorkspaceBuiltInProfilesListRoute,
  createWorkspaceCustomProfileDeleteRoute,
} from "./routes/workspace-built-in-profiles.ts";
import { markCallerSessionRecoveryProved } from "./plugins/recovery-session.ts";
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
import {
  createInvitationAcceptRoute,
  createInvitationPreviewRoute,
  createInvitationVaultAccessGetRoute,
  createInvitationVaultAccessPutRoute,
  createMemberVaultAccessGetRoute,
  createMemberVaultAccessPutRoute,
  createPendingVaultWrapsGetRoute,
  createWorkspaceInvitationDeleteRoute,
  createWorkspaceInvitationPatchRoute,
  createWorkspaceInvitationsCreateRoute,
  createWorkspaceKeyDeferredRotationRoute,
  createWorkspaceKeyPendingRecipientsRoute,
  createWorkspaceKeyPendingRotationsRoute,
  createWorkspaceMemberDeleteRoute,
  createWorkspaceMemberDirectoryRoute,
  createWorkspaceMemberPatchRoute,
  createWorkspaceMembersListRoute,
} from "./routes/workspace-members.ts";
import {
  createVaultAccessGetRoute,
  createVaultAccessUpdateRoute,
  createVaultDeleteRoute,
  createVaultKeyRotateRoute,
  createVaultMemberRoleUpdateRoute,
  createVaultShareRevokeRoute,
  createVaultSharesListRoute,
  createVaultShareUpsertRoute,
  createWorkspaceVaultCreateRoute,
} from "./routes/workspace-shared-vaults.ts";
import { createVaultProfileWriteGuardMiddleware } from "./vault-profile-write-guard/middleware.ts";
import { VaultProfileWriteGuardRepository } from "./vault-profile-write-guard/repository.ts";
import { VaultProfileWriteGuardService } from "./vault-profile-write-guard/service.ts";
import type { WorkspaceSharedVaultsService } from "./workspace-shared-vaults/service.ts";
import {
  createWorkspaceClientSettingsGetRoute,
  createWorkspaceClientSettingsPutRoute,
  createWorkspaceKeyGetRoute,
  createWorkspaceKeyGrantRoute,
  createWorkspaceKeyPublishRoute,
  createWorkspaceLogoDeleteRoute,
  createWorkspaceLogoGetRoute,
  createWorkspaceLogoPutRoute,
} from "./routes/workspace-key.ts";
import type { WorkspaceKeyService } from "./workspace-key/service.ts";
import { createWorkspaceMePermissionsRoute } from "./routes/workspace-me-permissions.ts";
import {
  createWorkspaceMeVaultProfilesRoute,
  WorkspaceMeVaultProfilesService,
} from "./routes/workspace-me-vault-profiles.ts";
import type { WorkspaceMembersService } from "./workspace-members/service.ts";
import { createVaultUnlockBootstrapRoute } from "./routes/vault-unlock-bootstrap.ts";
import {
  createAccountVaultUnlockRoute,
  createAccountVaultUnlockStatusRoute,
} from "./routes/account-vault-unlock.ts";
import {
  createVaultUnlockAttemptStore,
  type VaultUnlockAttemptRedis,
} from "./account/vault-unlock-attempts.ts";
import { createAccountMasterPasswordChangeRoute } from "./routes/account-master-password-change.ts";
import { MldsaIdentityKeyService } from "./account/mldsa-identity-key.ts";
import { createAccountMlDsaIdentityKeyRoute } from "./routes/account-mldsa-identity-key.ts";
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
import type { WebAuthnService } from "./webauthn/service.ts";
import type { VaultService } from "./vault/service.ts";
import type { VaultSharingService } from "./vault-sharing/service.ts";
import type { CapsuleService } from "./capsule/service.ts";
import type { ItemCategoryPreferencesService } from "./item-category-preferences/service.ts";
import type { CapsuleDefaultsService } from "./capsule-defaults/service.ts";
import type { ItemTemplatesService } from "./item-templates/service.ts";
import type { WorkspaceSettingsService } from "./workspace-settings/service.ts";
import type { PlanChangeRequestService } from "./plan-change-request/service.ts";
import type { VaultUnlockBootstrapService } from "./account/vault-unlock-bootstrap.ts";
import type { UsersRepository } from "./storage/repositories.ts";
import type { AttachmentService } from "./attachments/service.ts";
import type { ItemFaviconService } from "./favicon/service.ts";
import {
  createAttachmentDeleteRoute,
  createAttachmentDownloadRoute,
  createAttachmentUploadRoute,
} from "./routes/attachments.ts";
import { createItemFaviconConfigRoute, createItemFaviconPreviewRoute } from "./routes/item-favicons.ts";
import { requireEnrolledRecoveryKey } from "./routes/require-recovery-key.ts";
import { createRecoveryProofAttemptStore } from "./account-recovery/recovery-proof-attempts.ts";
import {
  createHttpUpdateAgentClient,
  unavailableUpdateAgent,
} from "./system-updates/agent-client.ts";
import { registerSystemUpdateRoutes } from "./system-updates/routes.ts";
import { registerServerMailSettingsRoutes } from "./mail-settings/routes.ts";
import type { MailSettingsService } from "./mail-settings/service.ts";
import {
  createSystemUpdateService,
  type SystemUpdateService,
} from "./system-updates/service.ts";

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
  geoIp?: ApiEnterprisePluginContext["geoIp"];
  /** Test clock for recovery-proof lockouts. */
  recoveryProofNow?: () => number;
}

export interface AppDeps {
  readyCheck?: () => Promise<void>;
  authService?: AuthService;
  registrationService?: RegistrationService;
  vaultService?: VaultService;
  vaultUnlockBootstrapService?: VaultUnlockBootstrapService;
  /** When set with `sessionService`, exposes account profile routes (Bearer). */
  usersRepository?: Pick<
    UsersRepository,
    "loadAccountProfile" | "updateAccountProfile" | "recordVaultUnlock" | "findById"
  >;
  emailChangeService?: EmailChangeService;
  vaultSharingService?: VaultSharingService;
  syncService?: SyncService;
  deviceService?: DeviceService;
  accountRecoveryService?: AccountRecoveryService;
  sessionService?: SessionService;
  /** Browser extension PKCE session handoff (issue code + token exchange). */
  extensionAuthService?: ExtensionAuthService;
  twoFactorService?: TwoFactorService;
  webauthnService?: WebAuthnService;
  capsuleService?: CapsuleService;
  itemCategoryPreferencesService?: ItemCategoryPreferencesService;
  capsuleDefaultsService?: CapsuleDefaultsService;
  itemTemplatesService?: ItemTemplatesService;
  workspaceSettingsService?: WorkspaceSettingsService;
  planChangeRequestService?: PlanChangeRequestService;
  workspaceBuiltInRolesService?: WorkspaceBuiltInRolesService;
  workspaceBuiltInProfilesService?: WorkspaceBuiltInProfilesService;
  workspaceMeVaultProfilesService?: WorkspaceMeVaultProfilesService;
  workspaceMembersService?: WorkspaceMembersService;
  workspaceSharedVaultsService?: WorkspaceSharedVaultsService;
  workspaceKeyService?: WorkspaceKeyService;
  workspacePersonalSyncService?: WorkspacePersonalSyncService;
  attachmentService?: AttachmentService;
  itemFaviconService?: ItemFaviconService;
  /** Self-host system updates. Tests inject this; production builds it from config. */
  systemUpdateService?: SystemUpdateService;
  /** Self-host SMTP and public app URL. Absent in tests that do not exercise mail settings. */
  mailSettingsService?: MailSettingsService;
}

export function createApiApp(
  config: ApiConfig,
  logger: Logger,
  deps: AppDeps = {},
  options: CreateApiAppOptions = {},
): HttpApp & {
  /** Resolves after every plugin `register` finishes, in list order. Rejects on failure. */
  pluginsReady: Promise<void>;
} {
  const app = new HttpApp();
  const readyCheck = deps.readyCheck ?? (async () => {});

  app.use(createErrorHandlerMiddleware(logger));
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use(createRequestLoggerMiddleware(logger));

  const resolveSessionStrict =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedSession(config, deps.sessionService)
      : null;
  const sessionIfDeviceTrusted = async (
    req: IncomingMessage,
  ): Promise<{ userId: string; deviceId: string | null } | null> => {
    if (!resolveSessionStrict) {
      const header = getHeader(req, "x-user-id")?.trim();
      return header ? { userId: header, deviceId: null } : null;
    }
    const session = await resolveSessionStrict(req);
    if (!session) {
      return null;
    }
    if (session.deviceId && deps.deviceService?.isSessionDeviceTrusted) {
      const trusted = await deps.deviceService.isSessionDeviceTrusted(
        session.userId,
        session.deviceId,
      );
      if (!trusted) {
        return null;
      }
    }
    return { userId: session.userId, deviceId: session.deviceId };
  };
  const resolveUserId: (req: IncomingMessage) => Promise<string | null> = async (req) => {
    const session = await sessionIfDeviceTrusted(req);
    return session?.userId ?? null;
  };
  if (options.postgres && options.vaultsRepository) {
    const vaultProfileWriteGuard = new VaultProfileWriteGuardService(
      new VaultProfileWriteGuardRepository(options.postgres),
      options.vaultsRepository,
    );
    app.use(createVaultProfileWriteGuardMiddleware(vaultProfileWriteGuard, resolveUserId));
  }
  /** Device list/register and the revoke guard must see an unbound Bearer so it can bind or return 403. */
  const resolveUserIdAllowUnboundDevice: (req: IncomingMessage) => Promise<string | null> =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedUserId(config, deps.sessionService, undefined, {
          allowUnboundDevice: true,
        })
      : resolveUserId;
  const resolveSessionAllowUnboundDevice =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedSession(config, deps.sessionService, undefined, {
          allowUnboundDevice: true,
        })
      : undefined;
  /**
   * Pending and other untrusted full sessions. Vault ciphertext stays on `resolveUserId`
   * until the session proves the recovery key or the device is approved.
   */
  const resolveFullSession =
    resolveSessionAllowUnboundDevice ??
    (async (req: IncomingMessage) => {
      const session = await sessionIfDeviceTrusted(req);
      if (!session) {
        return null;
      }
      return {
        userId: session.userId,
        deviceId: session.deviceId,
        scope: null as string | null,
        tokenHash: "",
        expiresAt: null as string | null,
        recoveryProvedAt: null as string | null,
        recoveryChallenge: null as string | null,
      };
    });
  const resolveRecoveryStatusAccess = async (
    req: IncomingMessage,
  ): Promise<{ userId: string; includeDirectory: boolean } | null> => {
    const trusted = await sessionIfDeviceTrusted(req);
    if (trusted) {
      return { userId: trusted.userId, includeDirectory: true };
    }
    const session = await resolveFullSession(req);
    if (!session || !isFullSessionScope(session.scope)) {
      return null;
    }
    return {
      userId: session.userId,
      includeDirectory: Boolean(session.recoveryProvedAt),
    };
  };
  /** Trusted device, or a full session that has proved the recovery key. */
  const resolveUserIdForRestore: (req: IncomingMessage) => Promise<string | null> = async (req) => {
    const trusted = await resolveUserId(req);
    if (trusted) {
      return trusted;
    }
    const session = await resolveFullSession(req);
    if (!session || !isFullSessionScope(session.scope) || !session.recoveryProvedAt) {
      return null;
    }
    return session.userId;
  };
  const mayClaimAfterRecovery = async (req: IncomingMessage): Promise<boolean> => {
    if (await resolveUserId(req)) {
      return true;
    }
    const session = await resolveFullSession(req);
    return Boolean(session && isFullSessionScope(session.scope) && session.recoveryProvedAt);
  };
  /** Device bound to this session when the recovery key proof succeeded. */
  const resolveProvedRecoveryDevice = async (
    req: IncomingMessage,
  ): Promise<{ userId: string; deviceId: string } | null> => {
    const session = await resolveFullSession(req);
    if (!session || !isFullSessionScope(session.scope) || !session.recoveryProvedAt) {
      return null;
    }
    const deviceId = session.deviceId?.trim() ?? "";
    if (!deviceId) {
      return null;
    }
    return { userId: session.userId, deviceId };
  };
  /** Full session or post-register recovery bootstrap (enroll + ack-export only). */
  const resolveUserIdForRegistrationRecovery: (req: IncomingMessage) => Promise<string | null> =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedUserId(
          config,
          deps.sessionService,
          REGISTRATION_RECOVERY_ALLOWED_SCOPES,
        )
      : resolveUserId;
  const resolveSessionForRegistrationRecovery =
    deps.sessionService !== undefined
      ? createResolveAuthenticatedSession(
          config,
          deps.sessionService,
          REGISTRATION_RECOVERY_ALLOWED_SCOPES,
        )
      : undefined;

  const gateVaultUse = (handler: RouteHandler): RouteHandler =>
    deps.accountRecoveryService
      ? requireEnrolledRecoveryKey(deps.accountRecoveryService, resolveUserId, handler)
      : handler;

  app.route("GET", "/health", healthRouteHandler);
  const systemUpdateService =
    deps.systemUpdateService ??
    createSystemUpdateService({
      deploymentMode: config.deploymentMode,
      currentVersion: config.systemVersion,
      enterpriseInstalled: config.enterpriseModulesEnabled,
      enterpriseVersion: config.enterpriseVersion,
      feedUrl: config.updateFeedUrl,
      isolated: config.updateIsolated,
      agent:
        config.updateAgentUrl.trim() && config.updateAgentToken.trim()
          ? createHttpUpdateAgentClient({
              baseUrl: config.updateAgentUrl,
              token: config.updateAgentToken,
            })
          : unavailableUpdateAgent(),
      db: options.postgres,
    });
  registerSystemUpdateRoutes(
    (method, path, handler) => app.route(method, path, handler),
    config,
    systemUpdateService,
    resolveUserId,
  );
  if (deps.mailSettingsService) {
    registerServerMailSettingsRoutes(
      (method, path, handler) => app.route(method, path, handler),
      config,
      deps.mailSettingsService,
      resolveUserId,
    );
  }
  app.route("GET", "/ready", createReadyRouteHandler(readyCheck));
  if (deps.authService) {
    app.route(
      "POST",
      "/auth/email/start",
      createAuthEmailStartRoute(deps.authService, config.trustedProxyHops),
    );
    app.route(
      "POST",
      "/auth/email/resend",
      createAuthEmailResendRoute(deps.authService, config.trustedProxyHops),
    );
    app.route(
      "POST",
      "/auth/email/confirm",
      createAuthEmailConfirmRoute(deps.authService, config.trustedProxyHops),
    );
  }
  if (deps.registrationService) {
    app.route(
      "POST",
      "/auth/register/complete",
      createRegisterCompleteRoute(deps.registrationService, config.trustedProxyHops),
    );
  }
  if (deps.extensionAuthService) {
    app.route(
      "POST",
      "/auth/extension/code",
      // Email login has not bound a device yet; PKCE handoff must still mint a code.
      createExtensionAuthIssueCodeRoute(
        deps.extensionAuthService,
        resolveSessionAllowUnboundDevice ??
          (async () => null),
        async (userId, deviceId) => {
          if (!deps.deviceService?.isSessionDeviceTrusted) {
            return false;
          }
          return deps.deviceService.isSessionDeviceTrusted(userId, deviceId);
        },
      ),
    );
    app.route(
      "POST",
      "/auth/extension/token",
      createExtensionAuthTokenRoute(deps.extensionAuthService),
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
      createTwoFactorVerifyRoute(deps.twoFactorService, config.trustedProxyHops),
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
      "/auth/two-factor/backup-codes/ack-export",
      createBackupCodesAckExportRoute(deps.twoFactorService, resolveUserId),
    );
    app.route(
      "POST",
      "/auth/two-factor/disable",
      createTwoFactorDisableRoute(deps.twoFactorService, resolveUserId),
    );
  }
  if (deps.webauthnService) {
    app.route(
      "POST",
      "/auth/login/discover",
      createAuthLoginDiscoverRoute(deps.webauthnService),
    );
    app.route(
      "POST",
      "/auth/webauthn/login/options",
      createWebAuthnLoginOptionsRoute(deps.webauthnService, config.trustedProxyHops),
    );
    app.route(
      "POST",
      "/auth/webauthn/login/verify",
      createWebAuthnLoginVerifyRoute(deps.webauthnService),
    );
  }
  if (deps.sessionService !== undefined && deps.webauthnService) {
    app.route(
      "GET",
      "/account/login-methods",
      createLoginMethodsGetRoute(deps.webauthnService, resolveUserId),
    );
    app.route(
      "PATCH",
      "/account/login-methods/primary",
      createLoginMethodsPrimaryPatchRoute(deps.webauthnService, resolveUserId),
    );
    app.route(
      "POST",
      "/account/webauthn/register/options",
      createWebAuthnRegisterOptionsRoute(deps.webauthnService, resolveUserId),
    );
    app.route(
      "POST",
      "/account/webauthn/register/verify",
      createWebAuthnRegisterVerifyRoute(deps.webauthnService, resolveUserId),
    );
    app.route(
      "DELETE",
      "/account/webauthn/credentials/:credentialId",
      createWebAuthnCredentialDeleteRoute(deps.webauthnService, resolveUserId),
    );
    app.route(
      "DELETE",
      "/account/webauthn/credentials",
      createWebAuthnCredentialsBulkDeleteRoute(deps.webauthnService, resolveUserId),
    );
  }
  if (deps.vaultUnlockBootstrapService) {
    app.route(
      "GET",
      "/vault/unlock-bootstrap",
      createVaultUnlockBootstrapRoute(deps.vaultUnlockBootstrapService, sessionIfDeviceTrusted),
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
    {
      const unlockAttemptRedis =
        options.redis &&
        typeof (options.redis as VaultUnlockAttemptRedis).get === "function" &&
        typeof (options.redis as VaultUnlockAttemptRedis).setWithTtl === "function" &&
        typeof (options.redis as VaultUnlockAttemptRedis).del === "function"
          ? (options.redis as VaultUnlockAttemptRedis)
          : undefined;
      const unlockAttemptStore = createVaultUnlockAttemptStore(unlockAttemptRedis);
      app.route(
        "GET",
        "/account/vault-unlock/status",
        createAccountVaultUnlockStatusRoute(resolveUserId, {
          attemptStore: unlockAttemptStore,
        }),
      );
      app.route(
        "POST",
        "/account/vault-unlock",
        createAccountVaultUnlockRoute(deps.usersRepository, resolveUserId, {
          attemptStore: unlockAttemptStore,
        }),
      );
    }
    app.route(
      "POST",
      "/account/master-password/change",
      createAccountMasterPasswordChangeRoute(deps.usersRepository, resolveUserIdForRestore),
    );
    app.route(
      "POST",
      "/account/identity/mldsa-key",
      createAccountMlDsaIdentityKeyRoute(
        new MldsaIdentityKeyService(deps.usersRepository),
        resolveUserId,
      ),
    );
  }
  if (deps.sessionService !== undefined && deps.emailChangeService) {
    app.route(
      "POST",
      "/account/email-change/start",
      createAccountEmailChangeStartRoute(
        deps.emailChangeService,
        resolveUserId,
        config.trustedProxyHops,
      ),
    );
    app.route(
      "POST",
      "/account/email-change/resend",
      createAccountEmailChangeResendRoute(
        deps.emailChangeService,
        resolveUserId,
        config.trustedProxyHops,
      ),
    );
    app.route(
      "POST",
      "/account/email-change/confirm",
      createAccountEmailChangeConfirmRoute(
        deps.emailChangeService,
        resolveUserId,
        config.trustedProxyHops,
      ),
    );
  }
  const enterprisePlugins = options.enterprisePlugins ?? [];

  if (deps.vaultService) {
    app.route(
      "GET",
      "/workspaces",
      createWorkspacesListRoute(deps.vaultService, resolveUserIdForRestore),
    );
    app.route(
      "GET",
      "/workspaces/:workspaceId/vaults",
      gateVaultUse(createWorkspaceVaultsListRoute(deps.vaultService, resolveUserId)),
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
    if (deps.workspaceSharedVaultsService) {
      app.route(
        "POST",
        "/workspaces/:workspaceId/vaults",
        gateVaultUse(
          createWorkspaceVaultCreateRoute(deps.workspaceSharedVaultsService, resolveUserId),
        ),
      );
    }
    if (deps.workspaceMembersService) {
      const members = deps.workspaceMembersService;
      app.route(
        "GET",
        "/workspaces/:workspaceId/members",
        createWorkspaceMembersListRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/member-directory",
        createWorkspaceMemberDirectoryRoute(members, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/invitations",
        createWorkspaceInvitationsCreateRoute(members, resolveUserId),
      );
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/invitations/:invitationId",
        createWorkspaceInvitationDeleteRoute(members, resolveUserId),
      );
      app.route(
        "PATCH",
        "/workspaces/:workspaceId/invitations/:invitationId",
        createWorkspaceInvitationPatchRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/invitations/:invitationId/vault-access",
        createInvitationVaultAccessGetRoute(members, resolveUserId),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/invitations/:invitationId/vault-access",
        createInvitationVaultAccessPutRoute(members, resolveUserId),
      );
      app.route(
        "PATCH",
        "/workspaces/:workspaceId/members/:userId",
        createWorkspaceMemberPatchRoute(members, resolveUserId),
      );
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/members/:userId",
        createWorkspaceMemberDeleteRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/workspace-key/pending-recipients",
        createWorkspaceKeyPendingRecipientsRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/workspace-key/pending-rotations",
        createWorkspaceKeyPendingRotationsRoute(members, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/workspace-key/deferred-rotation",
        createWorkspaceKeyDeferredRotationRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/members/:userId/vault-access",
        createMemberVaultAccessGetRoute(members, resolveUserId),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/members/:userId/vault-access",
        createMemberVaultAccessPutRoute(members, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/pending-vault-wraps",
        createPendingVaultWrapsGetRoute(members, resolveUserId),
      );
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
    if (deps.capsuleDefaultsService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/capsule-defaults",
        gateVaultUse(
          createWorkspaceCapsuleDefaultsRoute(deps.capsuleDefaultsService, resolveUserId),
        ),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/capsule-defaults",
        gateVaultUse(
          createWorkspaceCapsuleDefaultsRoute(deps.capsuleDefaultsService, resolveUserId),
        ),
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
    if (deps.workspaceKeyService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/workspace-key",
        createWorkspaceKeyGetRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/workspace-key",
        createWorkspaceKeyPublishRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/workspace-key/wraps",
        createWorkspaceKeyGrantRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/logo",
        createWorkspaceLogoPutRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/logo",
        createWorkspaceLogoGetRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/logo",
        createWorkspaceLogoDeleteRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "GET",
        "/workspaces/:workspaceId/client-settings",
        createWorkspaceClientSettingsGetRoute(deps.workspaceKeyService, resolveUserId),
      );
      app.route(
        "PUT",
        "/workspaces/:workspaceId/client-settings",
        createWorkspaceClientSettingsPutRoute(deps.workspaceKeyService, resolveUserId),
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
    if (deps.planChangeRequestService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/plan-change-requests",
        createWorkspacePlanChangeRequestStatusRoute(
          deps.planChangeRequestService,
          resolveUserId,
        ),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/plan-change-requests",
        createWorkspacePlanChangeRequestRoute(deps.planChangeRequestService, resolveUserId),
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
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/roles/:roleId",
        createWorkspaceCustomRoleDeleteRoute(deps.workspaceBuiltInRolesService, resolveUserId),
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
      app.route(
        "DELETE",
        "/workspaces/:workspaceId/profiles/:profileId",
        createWorkspaceCustomProfileDeleteRoute(deps.workspaceBuiltInProfilesService, resolveUserId),
      );
    }
    if (deps.workspacePersonalSyncService) {
      app.route(
        "GET",
        "/workspaces/:workspaceId/personal-events",
        gateVaultUse(
          createWorkspacePersonalEventsListRoute(deps.workspacePersonalSyncService, resolveUserId),
        ),
      );
      app.route(
        "POST",
        "/workspaces/:workspaceId/personal-events",
        gateVaultUse(
          createWorkspacePersonalEventsAppendRoute(deps.workspacePersonalSyncService, resolveUserId),
        ),
      );
    }
    app.route(
      "GET",
      "/vaults/:vaultId",
      gateVaultUse(createVaultGetRoute(deps.vaultService, resolveUserId)),
    );
    app.route(
      "PATCH",
      "/vaults/:vaultId",
      gateVaultUse(createVaultUpdateRoute(deps.vaultService, resolveUserId)),
    );
    if (deps.workspaceSharedVaultsService) {
      const sharedVaults = deps.workspaceSharedVaultsService;
      app.route(
        "DELETE",
        "/vaults/:vaultId",
        gateVaultUse(createVaultDeleteRoute(sharedVaults, resolveUserId)),
      );
      app.route(
        "GET",
        "/vaults/:vaultId/access",
        gateVaultUse(createVaultAccessGetRoute(sharedVaults, resolveUserId)),
      );
      app.route(
        "PUT",
        "/vaults/:vaultId/access",
        gateVaultUse(createVaultAccessUpdateRoute(sharedVaults, resolveUserId)),
      );
    }
  }
  if (deps.vaultSharingService) {
    app.route(
      "GET",
      "/vaults/:vaultId/key",
      gateVaultUse(createVaultKeyGetRoute(deps.vaultSharingService, resolveUserId)),
    );
    app.route(
      "GET",
      "/vaults/:vaultId/shares",
      gateVaultUse(createVaultSharesListRoute(deps.vaultSharingService, resolveUserId)),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/shares",
      gateVaultUse(createVaultShareUpsertRoute(deps.vaultSharingService, resolveUserId)),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/shares/revoke",
      gateVaultUse(createVaultShareRevokeRoute(deps.vaultSharingService, resolveUserId)),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/key/rotate",
      gateVaultUse(createVaultKeyRotateRoute(deps.vaultSharingService, resolveUserId)),
    );
    app.route(
      "PATCH",
      "/vaults/:vaultId/shares/:userId",
      gateVaultUse(createVaultMemberRoleUpdateRoute(deps.vaultSharingService, resolveUserId)),
    );
  }
  const invitePreviewRateLimit = options.redis
    ? {
        incr: (key: string) => options.redis!.incr(key),
        expire: (key: string, seconds: number) => options.redis!.expire(key, seconds),
        windowSeconds: config.authRateLimitWindowSeconds,
        maxPerIp: config.invitePreviewRateLimitPerIp,
        trustedProxyHops: config.trustedProxyHops,
      }
    : undefined;
  if (deps.workspaceMembersService) {
    app.route(
      "GET",
      "/invitations/:token",
      createInvitationPreviewRoute(deps.workspaceMembersService, invitePreviewRateLimit),
    );
    app.route(
      "POST",
      "/invitations/:token/accept",
      createInvitationAcceptRoute(deps.workspaceMembersService, resolveUserId),
    );
  }
  if (deps.syncService) {
    app.route(
      "GET",
      "/vaults/:vaultId/events",
      gateVaultUse(createSyncEventsListRoute(deps.syncService, resolveUserId)),
    );
    app.route(
      "POST",
      "/vaults/:vaultId/events",
      gateVaultUse(
        createSyncEventsAppendRoute(deps.syncService, resolveUserId, config.cryptoRolloutMode),
      ),
    );
  }
  if (deps.deviceService) {
    app.route(
      "GET",
      "/devices",
      createListDevicesRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        resolveSessionAllowUnboundDevice,
      ),
    );
    app.route(
      "POST",
      "/devices/register",
        createRegisterDeviceRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        config.trustedProxyHops,
        deps.sessionService,
        mayClaimAfterRecovery,
        resolveProvedRecoveryDevice,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/bind-challenge",
      createDeviceBindChallengeRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        deps.sessionService,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/bind-session",
      createBindDeviceSessionRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        deps.sessionService,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/request-key-rebind",
      createRequestDeviceKeyRebindRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        config.trustedProxyHops,
        deps.sessionService,
      ),
    );
    app.route(
      "PATCH",
      "/devices/:deviceId",
      createPatchDeviceRoute(deps.deviceService, resolveUserId),
    );
    app.route(
      "POST",
      "/devices/:deviceId/revoke",
      createRevokeDeviceRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        deps.sessionService,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/approve",
      createApproveDeviceRoute(deps.deviceService, resolveUserId),
    );
    app.route(
      "GET",
      "/devices/:deviceId/share-delivery",
      createGetShareDeliveryRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        resolveSessionAllowUnboundDevice,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/share-delivery/confirm",
      createConfirmShareDeliveryRoute(
        deps.deviceService,
        resolveUserIdAllowUnboundDevice,
        resolveSessionAllowUnboundDevice,
      ),
    );
    app.route(
      "POST",
      "/devices/:deviceId/reject",
      createRejectDeviceRoute(deps.deviceService, resolveUserId, deps.sessionService),
    );
    app.route(
      "POST",
      "/devices/:deviceId/block",
      createBlockDeviceRoute(deps.deviceService, resolveUserId, deps.sessionService),
    );
    app.route(
      "POST",
      "/devices/:deviceId/unblock",
      createUnblockDeviceRoute(deps.deviceService, resolveUserId),
    );
  }
  if (deps.accountRecoveryService) {
    app.route(
      "GET",
      "/account/recovery",
      createAccountRecoveryStatusRoute(deps.accountRecoveryService, resolveRecoveryStatusAccess),
    );
    if (deps.sessionService && deps.usersRepository) {
      app.route(
        "POST",
        "/account/recovery/key/prove",
        createAccountRecoveryKeyProveRoute(
          deps.accountRecoveryService,
          async (req) => {
            const session = await resolveFullSession(req);
            if (!session || !isFullSessionScope(session.scope)) {
              return null;
            }
            return session.userId;
          },
          {
            resolveSession: resolveFullSession,
            sessionService: deps.sessionService,
            now: options.recoveryProofNow,
            attemptStore: createRecoveryProofAttemptStore(
              options.redis &&
                typeof (options.redis as { get?: unknown }).get === "function" &&
                typeof (options.redis as { setWithTtl?: unknown }).setWithTtl === "function" &&
                typeof (options.redis as { del?: unknown }).del === "function"
                ? (options.redis as {
                    get(key: string): Promise<string | null>;
                    setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
                    del(key: string): Promise<number>;
                  })
                : undefined,
            ),
          },
        ),
      );
    }
    app.route(
      "PATCH",
      "/account/recovery/settings",
      createAccountRecoverySettingsPatchRoute(deps.accountRecoveryService, resolveUserId),
    );
    app.route(
      "POST",
      "/account/recovery/key/enroll",
      createAccountRecoveryKeyEnrollRoute(
        deps.accountRecoveryService,
        resolveUserIdForRegistrationRecovery,
        resolveSessionForRegistrationRecovery,
        {
          allowRotate: async (req) => (await resolveUserIdForRestore(req)) != null,
        },
      ),
    );
    app.route(
      "POST",
      "/account/recovery/key/rotate",
      createAccountRecoveryKeyRotateRoute(deps.accountRecoveryService, resolveUserIdForRestore),
    );
    app.route(
      "POST",
      "/account/recovery/key/ack-export",
      createAccountRecoveryKeyAckExportRoute(
        deps.accountRecoveryService,
        resolveUserIdForRegistrationRecovery,
        {
          resolveSession: resolveSessionForRegistrationRecovery,
          sessionService: deps.sessionService,
        },
      ),
    );
    app.route(
      "GET",
      "/account/recovery/key/wrap",
      createAccountRecoveryKeyWrapRoute(deps.accountRecoveryService, resolveUserIdForRestore),
    );
    app.route(
      "GET",
      "/account/recovery/identity-encrypted-key",
      createAccountRecoveryIdentityEncryptedKeyRoute(
        deps.accountRecoveryService,
        resolveUserIdForRestore,
      ),
    );
  }
  if (deps.capsuleService) {
    app.route(
      "GET",
      "/workspaces/:workspaceId/capsules",
      gateVaultUse(createCapsuleOwnerListRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "POST",
      "/workspaces/:workspaceId/capsules",
      gateVaultUse(createCapsuleCreateRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "GET",
      "/capsules/:capsuleId",
      gateVaultUse(createCapsuleMetadataRoute(deps.capsuleService)),
    );
    app.route(
      "GET",
      "/capsules/:capsuleId/owner",
      gateVaultUse(createCapsuleOwnerDetailRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "PUT",
      "/capsules/:capsuleId",
      gateVaultUse(createCapsuleUpdateRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "POST",
      "/capsules/:capsuleId/open",
      gateVaultUse(createCapsuleOpenRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "POST",
      "/capsules/:capsuleId/revoke",
      gateVaultUse(createCapsuleRevokeRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "PATCH",
      "/capsules/:capsuleId/state",
      gateVaultUse(createCapsuleStateRoute(deps.capsuleService, resolveUserId)),
    );
    app.route(
      "DELETE",
      "/capsules/:capsuleId",
      gateVaultUse(createCapsuleDeleteRoute(deps.capsuleService, resolveUserId)),
    );
  }
  if (deps.attachmentService) {
    app.route(
      "POST",
      "/vaults/:vaultId/items/:itemId/attachments",
      gateVaultUse(createAttachmentUploadRoute(deps.attachmentService, resolveUserId)),
    );
    app.route(
      "GET",
      "/vaults/:vaultId/items/:itemId/attachments/:attachmentId",
      gateVaultUse(createAttachmentDownloadRoute(deps.attachmentService, resolveUserId)),
    );
    app.route(
      "DELETE",
      "/vaults/:vaultId/items/:itemId/attachments/:attachmentId",
      gateVaultUse(createAttachmentDeleteRoute(deps.attachmentService, resolveUserId)),
    );
  }

  if (deps.itemFaviconService) {
    app.route("GET", "/favicon/config", createItemFaviconConfigRoute(deps.itemFaviconService));
    app.route(
      "POST",
      "/favicon/preview",
      createItemFaviconPreviewRoute(deps.itemFaviconService, resolveUserId),
    );
  }

  const postgres = options.postgres;
  const workspacesRepository = options.workspacesRepository;
  const pluginsReady = (async () => {
    if (!postgres || !workspacesRepository) {
      return;
    }
    for (const plugin of enterprisePlugins) {
      const registration = plugin.register({
        app,
        config,
        resolveUserId,
        resolveUserIdAllowUnboundDevice,
        markSessionRecoveryProved: (req, input) => {
          if (!deps.sessionService || !resolveSessionAllowUnboundDevice) {
            return Promise.resolve(false);
          }
          return markCallerSessionRecoveryProved(req, input, {
            resolveSession: resolveSessionAllowUnboundDevice,
            markRecoveryProved: (accessToken, userId) =>
              deps.sessionService!.markRecoveryProved(accessToken, userId),
            onMarked: (method) => {
              logger.info("session recovery proved", { method });
            },
          });
        },
        postgres,
        redis: options.redis,
        publicAppBaseUrl: options.publicAppBaseUrl ?? config.publicAppBaseUrl,
        resolvePublicAppBaseUrl: deps.mailSettingsService
          ? () => deps.mailSettingsService!.publicAppBaseUrl()
          : undefined,
        emailTemplates: options.emailTemplates,
        geoIp: options.geoIp,
        repositories: {
          workspaces: workspacesRepository,
          vaults: options.vaultsRepository,
        },
        services: {
          vaultSharingService: deps.vaultSharingService,
        },
      });
      if (plugin.capsuleAccessSettings) {
        registerCapsuleAccessSettingsProvider(plugin.capsuleAccessSettings);
      }
      await registration;
      if (plugin.capsuleAccessSettings) {
        registerCapsuleAccessSettingsProvider(plugin.capsuleAccessSettings);
      }
    }
  })();

  return Object.assign(app, { pluginsReady });
}
