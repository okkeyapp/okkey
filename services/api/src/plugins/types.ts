import type { IncomingMessage } from "node:http";

import type { PlanFeature, PlanFeatureWriteDecision } from "@okkey/types";

import type { ApiConfig } from "../config.ts";
import type { WorkspacePlanEntitlementSource } from "../plan-entitlements.ts";
import type { EmailTemplateService } from "../email/service.ts";
import type { HttpApp } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { CapsuleAccessSettingsProvider } from "../capsule/access-settings-provider.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";

export type ApiEnterprisePluginRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
};

export type ApiEnterprisePluginContext = {
  app: HttpApp;
  config: ApiConfig;
  /**
   * User id for a trusted device session.
   * An unbound or not-yet-trusted device does not resolve.
   */
  resolveUserId: (req: IncomingMessage) => Promise<string | null>;
  /**
   * User id for a full session whose device may be unbound or not trusted.
   * Same session acceptance as `GET /account/recovery`.
   * Does not replace `resolveUserId`.
   */
  resolveUserIdAllowUnboundDevice: (req: IncomingMessage) => Promise<string | null>;
  /**
   * Set `recovery_proved_at` on the caller's current full session.
   * Same update as `POST /account/recovery/key/prove`: the grant lasts until that
   * session's existing `expires_at`, the challenge is cleared, and other sessions
   * are left unchanged. `method` is a non-empty channel label and is not stored.
   * Returns false when the bearer session is missing, not a full session, or expired.
   */
  markSessionRecoveryProved: (
    req: IncomingMessage,
    input: { method: string },
  ) => Promise<boolean>;
  postgres: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  };
  redis?: ApiEnterprisePluginRedis;
  publicAppBaseUrl?: string;
  /** Effective public origin at send time (database, otherwise env). */
  resolvePublicAppBaseUrl?: () => Promise<string>;
  emailTemplates?: Pick<
    EmailTemplateService,
    | "sendWorkspaceInvite"
    | "sendDeviceRecoveryApprovalRequestBestEffort"
    | "sendContactRecoveryReleaseRequestBestEffort"
    | "sendTrustedContactInviteBestEffort"
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
  /**
   * Create/update gate for an enterprise-module feature.
   * Call this on POST, PUT, and PATCH. Do not call it on GET, list, or DELETE:
   * a lapsed plan keeps existing rows readable and deletable.
   * `allowed: false` with `PLAN_LICENSE_LAPSED` is HTTP 402. `PLAN_FEATURE_REQUIRED` is HTTP 403.
   * The deployment mode and whether modules are loaded come from API config, not from the caller.
   */
  assertEnterpriseModuleWrite(
    workspace: WorkspacePlanEntitlementSource,
    feature: PlanFeature,
  ): PlanFeatureWriteDecision;
  /**
   * Record the enterprise feed's license decision.
   * Expired sets the lapse flag (plan writes return 402). A later accepted feed clears it.
   */
  setEnterpriseLicenseLapsed(lapsed: boolean): void;
};

export interface ApiEnterprisePlugin {
  readonly id: string;
  register(ctx: ApiEnterprisePluginContext): void | Promise<void>;
  /**
   * Paid capsule access settings. Absent on open core.
   * Core calls this during create, update, and open.
   */
  capsuleAccessSettings?: CapsuleAccessSettingsProvider;
}
