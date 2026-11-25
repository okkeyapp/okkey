import { AuthService } from "./auth/service.ts";
import { EmailChangeService } from "./account/email-change.ts";
import { whenCapsuleAccessSettingsBound } from "./capsule/access-settings-provider.ts";
import { CapsuleDefaultsService } from "./capsule-defaults/service.ts";
import { CapsuleService } from "./capsule/service.ts";
import { MmdbGeoIpLookup } from "./capsule/geoip.ts";
import { RegistrationService } from "./registration/service.ts";
import { createServer } from "node:http";
import { createApiApp } from "./app.ts";
import { isEnterpriseBackendLoadable, loadConfig } from "./config.ts";
import { ensureSelfHostedInstanceWorkspace } from "./setup/ensure-instance-workspace.ts";
import { hasSelfHostedInstanceAccess } from "./setup/instance-access.ts";
import { RedisDeviceBindChallengeStore } from "./device/bind-challenge-store.ts";
import { DeviceApprovalStatusService } from "./device/approval-status.ts";
import { DeviceService } from "./device/service.ts";
import { PostgresDeviceApprovalStatusStore } from "./storage/device-approval-status-repository.ts";
import { json } from "./http.ts";
import {
  createOutboundEmailSender,
  EmailTemplateService,
  isOutboundEmailDeliverable,
} from "./email/service.ts";
import { MailSettingsService } from "./mail-settings/service.ts";
import { PostgresServerMailSettingsStore } from "./mail-settings/store.ts";
import { createLogger } from "./logger.ts";
import { SessionService } from "./session/service.ts";
import { ExtensionAuthService } from "./extension-auth/service.ts";
import { createStorageLayer } from "./storage/index.ts";
import { SyncService } from "./sync/service.ts";
import { WorkspacePersonalSyncService } from "./workspace-personal-sync/service.ts";
import { WorkspaceKeyService, WorkspaceKeyServiceError } from "./workspace-key/service.ts";
import { PlanQuotaExceededError } from "./storage-quota/service.ts";
import { PgWorkspaceKeyStore } from "./workspace-key/store.ts";
import { TwoFactorService } from "./two-factor/service.ts";
import { WebAuthnService } from "./webauthn/service.ts";
import { PasskeyDeviceApprovalService } from "./webauthn/passkey-device-approval.ts";
import { WebAuthnCredentialsRepository } from "./webauthn/repository.ts";
import { VaultUnlockBootstrapService } from "./account/vault-unlock-bootstrap.ts";
import { VaultService } from "./vault/service.ts";
import { VaultSharingService } from "./vault-sharing/service.ts";
import { ItemCategoryPreferencesService } from "./item-category-preferences/service.ts";
import { ItemTemplatesService } from "./item-templates/service.ts";
import { ItemPurgeService } from "./item-purge/service.ts";
import {
  shouldRunBackgroundJobsInApiProcess,
  startBackgroundJobs,
} from "./jobs/background-jobs.ts";
import { WorkspaceSettingsService } from "./workspace-settings/service.ts";
import { PlanChangeRequestService } from "./plan-change-request/service.ts";
import { WorkspaceBuiltInRolesService } from "./workspace-roles/list-service.ts";
import { WorkspaceBuiltInProfilesService } from "./workspace-profiles/list-service.ts";
import { WorkspaceMeVaultProfilesService } from "./routes/workspace-me-vault-profiles.ts";
import {
  WorkspaceMembersService,
  type InviteRegistrationResolve,
} from "./workspace-members/service.ts";
import { WorkspaceSharedVaultsService } from "./workspace-shared-vaults/service.ts";
import { loadEnterprisePlugins } from "./plugins/load-enterprise-plugins.ts";
import {
  KeyFieldFileStorage,
  loadKeyFieldFileStorageConfigFromEnv,
} from "./storage/key-field-file-storage.ts";
import { backfillLegacyDeviceShares } from "./device/legacy-device-share-backfill.ts";
import { applySqlMigrations } from "./storage/migrate.ts";
import { ItemFaviconService } from "./favicon/service.ts";
import { AttachmentService } from "./attachments/service.ts";
import { WorkspaceStorageQuotaService } from "./storage-quota/service.ts";
import {
  assertWorkspacePermission,
  resolveWorkspacePermissions,
  WorkspacePermissionError,
} from "./workspace-roles/permissions.ts";
import { AccountRecoveryService } from "./account-recovery/service.ts";
import { initEntityIdGenerator } from "./entity-id.ts";

async function main(): Promise<void> {
  let config = loadConfig();
  initEntityIdGenerator(config.snowflakeNodeId);
  const logger = createLogger();
  const storage = await createStorageLayer(config, logger);
  await applySqlMigrations(storage.postgres, { logger });
  await backfillLegacyDeviceShares(storage.postgres, {
    approvalTtlMs: config.deviceApprovalTtlSeconds * 1000,
    logger,
  });
  // Lazily bound after WorkspaceMembersService is constructed (pending-invite flush on SMTP activate).
  let deliverPendingInvites: (() => Promise<void>) | null = null;
  const mailSettings = new MailSettingsService({
    store: new PostgresServerMailSettingsStore(storage.postgres),
    config,
    users: storage.repositories.users,
    workspaces: storage.repositories.workspaces,
    assertPermission: async (workspaceId, userId, action) => {
      await assertWorkspacePermission(storage.postgres, workspaceId, userId, "settings_mail", action);
    },
    logger,
    onSmtpActivated: async () => {
      if (deliverPendingInvites) {
        await deliverPendingInvites();
      }
    },
  });
  await mailSettings.probeLegacySmtpOnce();
  const emailSender = await createOutboundEmailSender(config, logger, storage.redis, mailSettings);
  const emailTemplates = new EmailTemplateService(emailSender, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
    resolveFrom: async () => (await mailSettings.effective()).emailFrom,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
    logger,
  });
  logger.info("email outbound ready", {
    provider: config.emailProvider,
    deliveryMode: config.emailDeliveryMode,
  });
  // Lazily bound after SetupService is constructed (invite-only + empty-catalog gate).
  let setupServiceRef: import("./setup/service.ts").SetupService | null = null;
  // Bound after WorkspaceMembersService exists (invite-link registration OTP skip).
  let resolveInviteRegistration:
    | ((rawToken: string, email: string) => Promise<InviteRegistrationResolve>)
    | null = null;
  // Bound after WorkspaceMembersService exists (email-invite OTP → instance token hash).
  let resolvePendingInstanceInviteTokenHash:
    | ((email: string) => Promise<string | null>)
    | null = null;
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
    resolveEmailDeliverable: () => mailSettings.isOutboundActive(),
    resolveRegistrationAllowed: async (email) => {
      if (!(await storage.repositories.users.hasAnyUsers())) {
        // Empty catalog: first owner must use the setup wizard, not email OTP.
        return config.deploymentMode !== "self_hosted";
      }
      if (!setupServiceRef) {
        return true;
      }
      if (config.deploymentMode === "self_hosted") {
        // Reject at email start unless there is exactly one pending invite to the
        // instance workspace (email invites without the link).
        if (!resolvePendingInstanceInviteTokenHash) {
          return false;
        }
        return (await resolvePendingInstanceInviteTokenHash(email)) != null;
      }
      const mode = await setupServiceRef.getRegistrationMode();
      if (mode === "open") {
        return true;
      }
      // Email invites only here — invite *links* are authorized earlier via
      // resolveInviteRegistration / tryInviteRegistrationSkip (no email on the row).
      return setupServiceRef.hasPendingInvitation(email);
    },
    resolveInviteRegistration: async (rawToken, email) => {
      if (!resolveInviteRegistration) {
        return { outcome: "not_found" };
      }
      return resolveInviteRegistration(rawToken, email);
    },
    resolveInstanceLoginAllowed: async (userId) =>
      hasSelfHostedInstanceAccess(storage.postgres, {
        deploymentMode: config.deploymentMode,
        userId,
      }),
    resolvePendingInstanceInviteTokenHash: async (email) => {
      if (!resolvePendingInstanceInviteTokenHash) {
        return null;
      }
      return resolvePendingInstanceInviteTokenHash(email);
    },
  });
  const emailChangeService = new EmailChangeService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    assertInstanceAccess: async (userId) =>
      hasSelfHostedInstanceAccess(storage.postgres, {
        deploymentMode: config.deploymentMode,
        userId,
      }),
  });
  const extensionAuthService = new ExtensionAuthService({
    redis: storage.redis,
    sessionService,
  });
  const twoFactorService = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
    emailTemplates,
  });
  const webauthnService = new WebAuthnService({
    redis: storage.redis,
    credentials: storage.repositories.webauthnCredentials,
    users: storage.repositories.users,
    authService,
    config,
  });
  const passkeyDeviceApprovalService = new PasskeyDeviceApprovalService({
    redis: storage.redis,
    credentials: storage.repositories.webauthnCredentials,
    devices: storage.repositories.devices,
    config,
    log: logger,
  });
  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    sessionService,
    config,
    log: logger,
  });
  const vaultSharingService = new VaultSharingService({
    db: storage.postgres,
    vaults: storage.repositories.vaults,
    config,
    log: logger,
  });
  const vaultService = new VaultService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
    config,
    db: storage.postgres,
  });
  const itemCategoryPreferencesService = new ItemCategoryPreferencesService({
    preferences: storage.repositories.workspaceMemberItemCategoryPreferences,
    workspaces: storage.repositories.workspaces,
    templates: storage.repositories.workspaceItemTemplates,
  });
  const capsuleDefaultsService = new CapsuleDefaultsService({
    defaults: storage.repositories.workspaceMemberCapsuleDefaults,
    workspaces: storage.repositories.workspaces,
    config,
  });
  const storageQuota = new WorkspaceStorageQuotaService({ db: storage.postgres, config });
  const workspaceSettingsService = new WorkspaceSettingsService({
    workspaces: storage.repositories.workspaces,
    vaults: storage.repositories.vaults,
    db: storage.postgres,
    config,
    storageQuota,
  });
  const planChangeRequestService = new PlanChangeRequestService({
    db: storage.postgres,
    workspaces: storage.repositories.workspaces,
    users: storage.repositories.users,
    emailTemplates,
    redis: storage.redis,
    salesEmail: config.salesEmail,
    salesEmailDeliverable: isOutboundEmailDeliverable(config),
    resolveSalesEmailDeliverable: () => mailSettings.isOutboundActive(),
    deploymentMode: config.deploymentMode,
    publicAppBaseUrl: config.publicAppBaseUrl,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
  });
  const workspaceBuiltInRolesService = new WorkspaceBuiltInRolesService({
    roles: storage.repositories.workspaceRoles,
    workspaces: storage.repositories.workspaces,
    db: storage.postgres,
  });
  const workspaceBuiltInProfilesService = new WorkspaceBuiltInProfilesService({
    profiles: storage.repositories.workspaceProfiles,
    workspaces: storage.repositories.workspaces,
    db: storage.postgres,
  });
  const workspaceMeVaultProfilesService = new WorkspaceMeVaultProfilesService(
    storage.repositories.workspaceProfiles,
    storage.repositories.workspaces,
    storage.postgres,
  );
  if (config.enterpriseModulesRequested && !config.enterpriseModulesEnabled) {
    logger.warn(
      "ENTERPRISE_MODULES=true but enterprise backend is not loadable; continuing as FREE",
      {
        enterpriseModulesPath: config.enterpriseModulesPath,
        loadable: isEnterpriseBackendLoadable(config.enterpriseModulesPath),
      },
    );
  }
  const enterpriseLoad = await loadEnterprisePlugins(config);
  if (config.enterpriseModulesEnabled && !enterpriseLoad.enterpriseModulesActive) {
    logger.warn("enterprise modules requested but plugin import failed; continuing without them", {
      enterpriseModulesPath: config.enterpriseModulesPath,
      error: enterpriseLoad.loadError,
    });
    config = { ...config, enterpriseModulesEnabled: false };
  }
  const enterprisePlugins = enterpriseLoad.plugins;
  const workspaceSharedVaultsService = new WorkspaceSharedVaultsService({
    vaults: storage.repositories.vaults,
    workspaces: storage.repositories.workspaces,
    db: storage.postgres,
    vaultSharing: vaultSharingService,
    config,
  });
  const workspaceKeyService = new WorkspaceKeyService(new PgWorkspaceKeyStore(storage.postgres), {
    assertMember: async (workspaceId, userId) => {
      const allowed = await storage.repositories.workspaces.hasAccess(workspaceId, userId);
      if (!allowed) {
        throw new WorkspaceKeyServiceError("ACCESS_DENIED", 403, "access denied");
      }
    },
    assertSettingsPut: async (workspaceId, userId) => {
      try {
        await assertWorkspacePermission(storage.postgres, workspaceId, userId, "settings", "put");
      } catch (error) {
        if (error instanceof WorkspacePermissionError) {
          throw new WorkspaceKeyServiceError(error.code, error.statusCode, error.message);
        }
        throw error;
      }
    },
  }, {
    assertLogoWrite: async ({ workspaceId, additionalBytes, replacedBytes }) => {
      const workspace = await storage.repositories.workspaces.findById(workspaceId);
      if (!workspace) {
        return;
      }
      try {
        await storageQuota.assertAdditionalBytes({
          workspace,
          additionalBytes,
          replacedBytes,
        });
      } catch (error) {
        if (error instanceof PlanQuotaExceededError) {
          throw new WorkspaceKeyServiceError(error.code, error.statusCode, error.message, error.details);
        }
        throw error;
      }
    },
  });
  const workspaceMembersService = new WorkspaceMembersService({
    db: storage.postgres,
    workspaces: storage.repositories.workspaces,
    vaultService: workspaceSharedVaultsService,
    emailTemplates,
    publicAppBaseUrl: config.publicAppBaseUrl,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
    resolveOutboundMailActive: () => mailSettings.isOutboundActive(),
    logger,
    config,
    deploymentMode: config.deploymentMode,
    workspaceKeys: workspaceKeyService,
  });
  resolveInviteRegistration = (rawToken, email) =>
    workspaceMembersService.resolveInviteForRegistration(rawToken, email);
  resolvePendingInstanceInviteTokenHash = (email) =>
    workspaceMembersService.findSinglePendingInstanceInviteTokenHash(email);
  registrationService.setConsumeInviteDuringRegistration(async (tx, input) => {
    const accepted = await workspaceMembersService.acceptInvitationForRegistrationInTx(
      tx,
      input,
    );
    return { workspaceId: accepted.workspaceId, vaultId: accepted.vaultId };
  });
  deliverPendingInvites = async () => {
    const result = await workspaceMembersService.deliverPendingInvitationEmails();
    logger.info("pending invitation emails delivered after SMTP activate", result);
  };
  const { SetupService } = await import("./setup/service.ts");
  const { PostgresServerInstanceSettingsStore } = await import("./setup/store.ts");
  const setupService = new SetupService({
    redis: storage.redis,
    users: storage.repositories.users,
    instanceSettings: new PostgresServerInstanceSettingsStore(storage.postgres),
    mailSettings,
    authService,
    sessionService,
    workspaceSettings: workspaceSettingsService,
    workspaceMembers: workspaceMembersService,
    postgres: storage.postgres,
    config: {
      deploymentMode: config.deploymentMode,
      nodeEnv: config.nodeEnv,
      registrationAuthStateTtlSeconds: config.registrationAuthStateTtlSeconds,
      sessionTtlSeconds: config.sessionTtlSeconds,
      setupCodePlaintext: (process.env.OKKEY_SETUP_CODE ?? "").trim() || undefined,
      setupCodeHash: (process.env.OKKEY_SETUP_CODE_HASH ?? "").trim() || undefined,
    },
    logger,
  });
  setupServiceRef = setupService;
  await ensureSelfHostedInstanceWorkspace({
    db: storage.postgres,
    deploymentMode: config.deploymentMode,
    logger,
  });
  await setupService.ensureBootstrapCode();
  const vaultUnlockBootstrapService = new VaultUnlockBootstrapService({
    users: storage.repositories.users,
    devices: storage.repositories.devices,
  });
  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
    users: storage.repositories.users,
    workspaces: storage.repositories.workspaces,
    storageQuota,
    config,
    log: logger,
  });
  const workspacePersonalSyncService = new WorkspacePersonalSyncService({
    workspaces: storage.repositories.workspaces,
    events: storage.repositories.workspacePersonalEvents,
    users: storage.repositories.users,
    config,
    log: logger,
  });
  const geoIp = new MmdbGeoIpLookup(config.geoIpEnabled, config.geoIpDbPath, logger);
  const capsuleService = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    users: storage.repositories.users,
    objectStorage: storage.objectStorage,
    storageQuota,
    geoIp,
    config,
    log: logger,
  });
  const deviceApprovalStatus = new DeviceApprovalStatusService({
    store: new PostgresDeviceApprovalStatusStore(storage.postgres),
    requestTtlSeconds: config.deviceApprovalTtlSeconds,
  });
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    emailTemplates,
    resolvePublicAppBaseUrl: () => mailSettings.publicAppBaseUrl(),
    geoIp,
    log: logger,
    bindChallenges: new RedisDeviceBindChallengeStore(storage.redis),
    approvalStatus: deviceApprovalStatus,
  });
  deviceApprovalStatus.onRetry((device, requestIp) =>
    deviceService.notifyReopenedApproval(device, requestIp),
  );
  const accountRecoveryService = new AccountRecoveryService({
    recovery: storage.repositories.accountRecovery,
    workspaces: storage.repositories.workspaces,
    users: storage.repositories.users,
    devices: storage.repositories.devices,
    config,
  });
  const keyFieldFileStorageConfig = loadKeyFieldFileStorageConfigFromEnv();
  const keyFieldFileStorage = keyFieldFileStorageConfig
    ? new KeyFieldFileStorage(keyFieldFileStorageConfig)
    : undefined;
  if (keyFieldFileStorage) {
    await keyFieldFileStorage.ensureBucket();
    logger.info("key field file storage initialized", {
      bucket: keyFieldFileStorageConfig?.bucket,
      endpoint: keyFieldFileStorageConfig?.endpoint,
    });
  }
  const itemFaviconService = new ItemFaviconService({
    provider: config.faviconProvider,
  });
  const attachmentService = keyFieldFileStorage
    ? new AttachmentService({
        storage: keyFieldFileStorage,
        attachments: storage.repositories.attachments,
        vaults: storage.repositories.vaults,
        workspaces: storage.repositories.workspaces,
        events: storage.repositories.events,
        softDeletes: storage.repositories.vaultItemSoftDeletes,
        templates: storage.repositories.workspaceItemTemplates,
        config,
        storageQuota,
        canUpdateWorkspaceBranding: async (workspaceId, userId) => {
          try {
            const matrix = await resolveWorkspacePermissions(
              storage.postgres,
              workspaceId,
              userId,
            );
            return matrix.settings.put >= 1;
          } catch (error) {
            if (error instanceof WorkspacePermissionError) {
              return false;
            }
            throw error;
          }
        },
      })
    : undefined;
  const itemTemplatesService = new ItemTemplatesService({
    templates: storage.repositories.workspaceItemTemplates,
    workspaces: storage.repositories.workspaces,
    vaults: storage.repositories.vaults,
    attachments: attachmentService,
  });
  const itemPurgeService = new ItemPurgeService({
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
    attachments: attachmentService,
  });
  if (enterprisePlugins.length > 0) {
    logger.info("enterprise modules loaded", {
      plugins: enterprisePlugins.map((plugin) => plugin.id),
    });
  }
  const app = createApiApp(config, logger, {
    readyCheck: () => storage.ping(),
    authService,
    registrationService,
    emailChangeService,
    usersRepository: storage.repositories.users,
    vaultService,
    itemCategoryPreferencesService,
    capsuleDefaultsService,
    itemTemplatesService,
    workspaceSettingsService,
    planChangeRequestService,
    workspaceBuiltInRolesService,
    workspaceBuiltInProfilesService,
    workspaceMeVaultProfilesService,
    workspaceMembersService,
    workspaceSharedVaultsService,
    workspaceKeyService,
    vaultUnlockBootstrapService,
    vaultSharingService,
    syncService,
    workspacePersonalSyncService,
    deviceService,
    deviceApprovalStatus,
    accountRecoveryService,
    sessionService,
    extensionAuthService,
    twoFactorService,
    webauthnService,
    passkeyDeviceApprovalService,
    capsuleService,
    attachmentService,
    itemFaviconService,
    mailSettingsService: mailSettings,
    setupService,
    assertUserInstanceAccess: async (userId) =>
      hasSelfHostedInstanceAccess(storage.postgres, {
        deploymentMode: config.deploymentMode,
        userId,
      }),
  }, {
    enterprisePlugins,
    postgres: storage.postgres,
    workspacesRepository: storage.repositories.workspaces,
    vaultsRepository: storage.repositories.vaults,
    emailTemplates,
    publicAppBaseUrl: config.publicAppBaseUrl,
    redis: storage.redis,
    geoIp,
  });
  await app.pluginsReady;
  await whenCapsuleAccessSettingsBound();

  // Public capability probe for web/UI flag sync (registered here to avoid touching app.ts).
  const enterpriseModulesActive = config.enterpriseModulesEnabled;
  app.route("GET", "/public/features", async (ctx) => {
    json(ctx.res, 200, {
      enterpriseModulesActive,
      deploymentMode: config.deploymentMode,
      requestId: ctx.requestId,
    });
  });

  const server = createServer(app.handler());
  server.listen(config.port, () => {
    logger.info("api server started", {
      nodeEnv: config.nodeEnv,
      port: config.port,
      logLevel: config.logLevel,
      enterpriseModulesActive,
      enterpriseModulesRequested: config.enterpriseModulesRequested,
    });
  });

  const runJobsInApi = shouldRunBackgroundJobsInApiProcess(config.nodeEnv);
  const backgroundJobs = runJobsInApi
    ? startBackgroundJobs({
        itemPurgeService,
        capsuleService,
        logger,
        runImmediately: false,
      })
    : null;
  if (!runJobsInApi) {
    logger.info("background jobs disabled in API process (use okkey-worker)", {
      hint: "Set RUN_BACKGROUND_JOBS=true to run jobs in-process, or start the worker container",
    });
  }

  const shutdown = async () => {
    logger.info("api server stopping");
    backgroundJobs?.stop();
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
  // Force exit: open storage sockets keep the event loop alive if we only set exitCode.
  process.exit(1);
});
