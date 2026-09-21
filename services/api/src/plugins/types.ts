import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import type { EmailTemplateService } from "../email/service.ts";
import type { HttpApp } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";

export type ApiEnterprisePluginRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
};

export type ApiEnterprisePluginContext = {
  app: HttpApp;
  config: ApiConfig;
  resolveUserId: (req: IncomingMessage) => Promise<string | null>;
  postgres: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  redis?: ApiEnterprisePluginRedis;
  publicAppBaseUrl?: string;
  emailTemplates?: Pick<
    EmailTemplateService,
    | "sendWorkspaceInvite"
    | "sendDeviceRecoveryApprovalRequestBestEffort"
    | "sendContactRecoveryReleaseRequestBestEffort"
  >;
  /** Same GeoIP pipeline as Phase 1 device approval list/email. */
  geoIp?: Pick<import("../capsule/geoip.ts").GeoIpLookup, "lookup">;
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
