import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import type { HttpApp } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";

export type ApiEnterprisePluginContext = {
  app: HttpApp;
  config: ApiConfig;
  resolveUserId: (req: IncomingMessage) => Promise<string | null>;
  postgres: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  publicAppBaseUrl?: string;
  emailTemplates?: Pick<EmailTemplateService, "sendWorkspaceInvite">;
  repositories: {
    workspaces: Pick<
      WorkspacesRepository,
      "findById" | "hasAccess" | "create" | "countOwnedByUser" | "listByOwner" | "listAccessibleByUser"
    >;
    vaults?: Pick<
      VaultsRepository,
      | "findById"
      | "listAccessibleByWorkspace"
      | "listByWorkspace"
      | "canReadVault"
      | "canManageVaultSettings"
      | "create"
      | "updateMetadata"
      | "deleteById"
    >;
  };
  /** Core crypto / key services used by enterprise product orchestration. */
  services: {
    vaultSharingService?: VaultSharingService;
  };
};

export interface ApiEnterprisePlugin {
  readonly id: string;
  register(ctx: ApiEnterprisePluginContext): void | Promise<void>;
}
