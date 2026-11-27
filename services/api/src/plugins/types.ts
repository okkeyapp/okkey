import type { IncomingMessage } from "node:http";

import type { PlanFeature, PlanFeatureWriteDecision } from "@okkey/types";

import type { ApiConfig } from "../config.ts";
import type { WorkspacePlanEntitlementSource } from "../plan-entitlements.ts";
import type { EmailTemplateService } from "../email/service.ts";
import type { HttpApp } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { CapsuleAccessSettingsProvider } from "../capsule/access-settings-provider.ts";
import type { FixedWindowCounterRedis } from "../storage/fixed-window-counter.ts";
import type { VaultSharingService } from "../vault-sharing/service.ts";
import type { PluginOutboundEmailMessage } from "./outbound-mail.ts";

/** Redis surface for fixed-window counters (and related enterprise rate limits). */
export type ApiEnterprisePluginRedis = FixedWindowCounterRedis;

export type { PluginOutboundEmailMessage };

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
   * Confirm or clear a verified enterprise license.
   * Default state is not licensed: optional modules stay off until the plugin
   * calls this with `verified: true` (at register/startup after verification,
   * and again whenever license state changes). `verified: false` turns modules
   * off again (invalid / missing license) without clearing the lapse flag.
   * Confirming `true` clears lapse. Does not log license contents.
   * On confirmed hosted mode, billing `plan_tier` drives entitlements instead;
   * still call this so probes and self-host fallback stay accurate.
   */
  setEnterpriseLicenseVerified(verified: boolean): void;
  /**
   * Record a license lapse (soft-lock). Independent of verification:
   * enterprise requested + plugin loaded + `lapsed: true` → enterprise-module
   * reads stay allowed and writes return 402 `PLAN_LICENSE_LAPSED`, even when
   * `setEnterpriseLicenseVerified(false)` was also called for an expired license.
   * Default `false` (fail-closed when an older plugin never calls this).
   * A later accepted check clears it via `lapsed: false` (or via verify `true`).
   * For never-verified / invalid licenses without a lapse report, leave this
   * false so modules stay fully off (403), not soft-locked.
   * Applies on self-host (including unconfirmed hosted env); ignored for
   * entitlement soft-lock when hosted mode is confirmed.
   */
  setEnterpriseLicenseLapsed(lapsed: boolean): void;
  /**
   * Whether Core outbound mail is active (OTP / invites).
   * Uses verified database mail settings when present; otherwise env deliverability.
   * `EMAIL_PROVIDER=logger` is not deliverable unless DB SMTP was verified.
   * Does not expose SMTP credentials.
   */
  isOutboundMailActive(): Promise<boolean>;
  /**
   * Send mail through the same outbound sender and effective From as Core OTP / invite mail.
   * Bounded connect/send timeout; never accepts or returns SMTP credentials.
   */
  sendOutboundEmail(message: PluginOutboundEmailMessage): Promise<void>;
  /**
   * Confirm or clear hosted (SaaS) deployment from a signed token issued by the
   * license server (one token for our hosting). Default `false`.
   * Hosted mode is effective only when `OKKEY_DEPLOYMENT_MODE` requests hosted
   * **and** this is `true`. Without confirmation the instance runs as
   * self-hosted (`plan_tier` ignored; license verify/lapse gates apply).
   * Call `true` after verifying the hosted token; call `false` when it lapses
   * or is absent so the instance falls back to self-hosted immediately.
   */
  setHostedDeploymentConfirmed(confirmed: boolean): void;
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
