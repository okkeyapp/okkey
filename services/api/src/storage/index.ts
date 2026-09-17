import type { ApiConfig } from "../config.ts";
import type { Logger } from "../logger.ts";
import { LocalObjectStorage } from "./object-storage.ts";
import { PostgresDatabase } from "./postgres.ts";
import { RedisCache } from "./redis.ts";
import {
  DevicesRepository,
  EventsRepository,
  ItemsRepository,
  SessionsRepository,
  TwoFactorRepository,
  UsersRepository,
  VaultsRepository,
  WorkspacesRepository,
} from "./repositories.ts";
import { WebAuthnCredentialsRepository } from "../webauthn/repository.ts";
import { WorkspaceMemberItemCategoryPreferencesRepository } from "./workspace-member-item-category-preferences.ts";
import { WorkspaceMemberCapsuleDefaultsRepository } from "./workspace-member-capsule-defaults.ts";
import { WorkspacePersonalEventsRepository } from "./workspace-personal-events.ts";
import { VaultItemSoftDeletesRepository } from "./vault-item-soft-deletes.ts";
import { WorkspaceItemTemplatesRepository } from "./workspace-item-templates.ts";
import { WorkspaceRolesRepository } from "./workspace-roles.ts";
import { WorkspaceProfilesRepository } from "./workspace-profiles.ts";
import { AttachmentsRepository } from "./attachments.ts";
import { AccountRecoveryRepository } from "./account-recovery.ts";

export interface StorageLayer {
  postgres: PostgresDatabase;
  redis: RedisCache;
  objectStorage: LocalObjectStorage;
  repositories: {
    users: UsersRepository;
    workspaces: WorkspacesRepository;
    vaults: VaultsRepository;
    items: ItemsRepository;
    events: EventsRepository;
    devices: DevicesRepository;
    sessions: SessionsRepository;
    twoFactor: TwoFactorRepository;
    webauthnCredentials: WebAuthnCredentialsRepository;
    workspaceMemberItemCategoryPreferences: WorkspaceMemberItemCategoryPreferencesRepository;
    workspaceMemberCapsuleDefaults: WorkspaceMemberCapsuleDefaultsRepository;
    workspacePersonalEvents: WorkspacePersonalEventsRepository;
    vaultItemSoftDeletes: VaultItemSoftDeletesRepository;
    workspaceItemTemplates: WorkspaceItemTemplatesRepository;
    workspaceRoles: WorkspaceRolesRepository;
    workspaceProfiles: WorkspaceProfilesRepository;
    attachments: AttachmentsRepository;
    accountRecovery: AccountRecoveryRepository;
  };
  ping(): Promise<void>;
  close(): Promise<void>;
}

export async function createStorageLayer(
  config: ApiConfig,
  logger: Logger,
): Promise<StorageLayer> {
  const postgres = await PostgresDatabase.connect(config.databaseUrl);
  const redis = await RedisCache.connect(config.redisUrl);
  const objectStorage = new LocalObjectStorage();

  const repositories = {
    users: new UsersRepository(postgres),
    workspaces: new WorkspacesRepository(postgres),
    vaults: new VaultsRepository(postgres),
    items: new ItemsRepository(postgres),
    events: new EventsRepository(postgres),
    devices: new DevicesRepository(postgres),
    sessions: new SessionsRepository(postgres),
    twoFactor: new TwoFactorRepository(postgres),
    webauthnCredentials: new WebAuthnCredentialsRepository(postgres),
    workspaceMemberItemCategoryPreferences: new WorkspaceMemberItemCategoryPreferencesRepository(postgres),
    workspaceMemberCapsuleDefaults: new WorkspaceMemberCapsuleDefaultsRepository(postgres),
    workspacePersonalEvents: new WorkspacePersonalEventsRepository(postgres),
    vaultItemSoftDeletes: new VaultItemSoftDeletesRepository(postgres),
    workspaceItemTemplates: new WorkspaceItemTemplatesRepository(postgres),
    workspaceRoles: new WorkspaceRolesRepository(postgres),
    workspaceProfiles: new WorkspaceProfilesRepository(postgres),
    attachments: new AttachmentsRepository(postgres),
    accountRecovery: new AccountRecoveryRepository(postgres),
  };

  logger.info("storage initialized", {
    postgres: "connected",
    redis: "connected",
  });

  return {
    postgres,
    redis,
    objectStorage,
    repositories,
    async ping() {
      await postgres.ping();
      await redis.ping();
    },
    async close() {
      await Promise.all([postgres.close(), redis.close()]);
    },
  };
}
