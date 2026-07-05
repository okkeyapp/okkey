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
import { WorkspaceMemberItemCategoryPreferencesRepository } from "./workspace-member-item-category-preferences.ts";
import { WorkspacePersonalEventsRepository } from "./workspace-personal-events.ts";
import { VaultItemSoftDeletesRepository } from "./vault-item-soft-deletes.ts";
import { VaultItemFaviconsRepository } from "./vault-item-favicons.ts";
import { WorkspaceItemTemplatesRepository } from "./workspace-item-templates.ts";

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
    workspaceMemberItemCategoryPreferences: WorkspaceMemberItemCategoryPreferencesRepository;
    workspacePersonalEvents: WorkspacePersonalEventsRepository;
    vaultItemSoftDeletes: VaultItemSoftDeletesRepository;
    vaultItemFavicons: VaultItemFaviconsRepository;
    workspaceItemTemplates: WorkspaceItemTemplatesRepository;
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
    workspaceMemberItemCategoryPreferences: new WorkspaceMemberItemCategoryPreferencesRepository(postgres),
    workspacePersonalEvents: new WorkspacePersonalEventsRepository(postgres),
    vaultItemSoftDeletes: new VaultItemSoftDeletesRepository(postgres),
    vaultItemFavicons: new VaultItemFaviconsRepository(postgres),
    workspaceItemTemplates: new WorkspaceItemTemplatesRepository(postgres),
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
