import { AuthService } from "./auth/service.ts";
import { EmailChangeService } from "./account/email-change.ts";
import { CapsuleService } from "./capsule/service.ts";
import { RegistrationService } from "./registration/service.ts";
import { createServer } from "node:http";
import { createApiApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { DeviceService } from "./device/service.ts";
import { createEmailSender, EmailTemplateService } from "./email/service.ts";
import { createLogger } from "./logger.ts";
import { SessionService } from "./session/service.ts";
import { createStorageLayer } from "./storage/index.ts";
import { SyncService } from "./sync/service.ts";
import { WorkspacePersonalSyncService } from "./workspace-personal-sync/service.ts";
import { TwoFactorService } from "./two-factor/service.ts";
import { VaultUnlockBootstrapService } from "./account/vault-unlock-bootstrap.ts";
import { VaultService } from "./vault/service.ts";
import { VaultSharingService } from "./vault-sharing/service.ts";
import { ItemCategoryPreferencesService } from "./item-category-preferences/service.ts";
import { ItemTemplatesService } from "./item-templates/service.ts";
import { ItemPurgeService } from "./item-purge/service.ts";
import { WorkspaceSettingsService } from "./workspace-settings/service.ts";
import { WorkspaceBuiltInRolesService } from "./workspace-roles/list-service.ts";
import { WorkspaceBuiltInProfilesService } from "./workspace-profiles/list-service.ts";
import { WorkspaceMembersService } from "./workspace-members/service.ts";
import { loadEnterprisePlugins } from "./plugins/load-enterprise-plugins.ts";
import {
  KeyFieldFileStorage,
  loadKeyFieldFileStorageConfigFromEnv,
} from "./storage/key-field-file-storage.ts";
import { ItemFaviconService } from "./favicon/service.ts";
import { AttachmentService } from "./attachments/service.ts";
import { initEntityIdGenerator } from "./entity-id.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  initEntityIdGenerator(config.snowflakeNodeId);
  const logger = createLogger();
  const storage = await createStorageLayer(config, logger);
  const emailSender = await createEmailSender(config, logger);
  const emailTemplates = new EmailTemplateService(emailSender, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
    logger,
  });
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });
  const emailChangeService = new EmailChangeService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  const twoFactorService = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    emailTemplates,
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
    db: storage.postgres,
  });
  const itemCategoryPreferencesService = new ItemCategoryPreferencesService({
    preferences: storage.repositories.workspaceMemberItemCategoryPreferences,
    workspaces: storage.repositories.workspaces,
    templates: storage.repositories.workspaceItemTemplates,
  });
  const workspaceSettingsService = new WorkspaceSettingsService({
    workspaces: storage.repositories.workspaces,
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
  const workspaceMembersService = new WorkspaceMembersService({
    db: storage.postgres,
    workspaces: storage.repositories.workspaces,
  });
  const enterprisePlugins = await loadEnterprisePlugins(config);
  const vaultUnlockBootstrapService = new VaultUnlockBootstrapService({
    users: storage.repositories.users,
    devices: storage.repositories.devices,
  });
  const syncService = new SyncService({
    vaults: storage.repositories.vaults,
    events: storage.repositories.events,
    softDeletes: storage.repositories.vaultItemSoftDeletes,
    users: storage.repositories.users,
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
  const capsuleService = new CapsuleService({
    db: storage.postgres,
    redis: storage.redis,
    users: storage.repositories.users,
    objectStorage: storage.objectStorage,
    config,
    log: logger,
  });
  const deviceService = new DeviceService({
    devices: storage.repositories.devices,
    config,
    users: storage.repositories.users,
    emailTemplates,
    log: logger,
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
  const itemFaviconService = new ItemFaviconService();
  const attachmentService = keyFieldFileStorage
    ? new AttachmentService({
        storage: keyFieldFileStorage,
        attachments: storage.repositories.attachments,
        vaults: storage.repositories.vaults,
        workspaces: storage.repositories.workspaces,
      })
    : undefined;
  const itemTemplatesService = new ItemTemplatesService({
    templates: storage.repositories.workspaceItemTemplates,
    workspaces: storage.repositories.workspaces,
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
    itemTemplatesService,
    workspaceSettingsService,
    workspaceBuiltInRolesService,
    workspaceBuiltInProfilesService,
    workspaceMembersService,
    vaultUnlockBootstrapService,
    vaultSharingService,
    syncService,
    workspacePersonalSyncService,
    deviceService,
    sessionService,
    twoFactorService,
    capsuleService,
    attachmentService,
    itemFaviconService,
  }, {
    enterprisePlugins,
    postgres: storage.postgres,
    workspacesRepository: storage.repositories.workspaces,
    vaultsRepository: storage.repositories.vaults,
    emailTemplates,
    publicAppBaseUrl: config.publicAppBaseUrl,
    redis: storage.redis,
  });

  const server = createServer(app.handler());
  server.listen(config.port, () => {
    logger.info("api server started", {
      nodeEnv: config.nodeEnv,
      port: config.port,
      logLevel: config.logLevel,
    });
  });

  const purgeIntervalMs = 60 * 60 * 1000;
  const purgeTimer = setInterval(() => {
    void itemPurgeService.purgeExpiredSoftDeletes().catch((error: unknown) => {
      logger.error("deleted items purge failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    });
  }, purgeIntervalMs);
  purgeTimer.unref();

  const shutdown = async () => {
    logger.info("api server stopping");
    clearInterval(purgeTimer);
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
