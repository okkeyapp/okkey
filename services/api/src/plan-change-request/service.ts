import {
  canRequestPlanUpgrade,
  isPlanTier,
  normalizePlanTier,
  type PlanTier,
} from "@okkey/types";

import type { DeploymentMode } from "../config.ts";
import { assertWorkspacePermission } from "../workspace-roles/permissions.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { UsersRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { EmailTemplateService } from "../email/service.ts";

/** Max license / plan-change request attempts per workspace per rolling 24h window. */
export const PLAN_CHANGE_REQUEST_DAILY_LIMIT = 3;

/** Rolling window length in seconds (Retry-After uses remaining TTL of this window). */
export const PLAN_CHANGE_REQUEST_WINDOW_SECONDS = 86_400;

export class PlanChangeRequestServiceError extends Error {
  readonly code:
    | "ACCESS_DENIED"
    | "WORKSPACE_NOT_FOUND"
    | "INVALID_REQUEST"
    | "PLAN_DOWNGRADE_FORBIDDEN"
    | "ALREADY_SUBMITTED"
    | "RATE_LIMITED"
    | "EMAIL_NOT_CONFIGURED"
    | "EMAIL_SEND_FAILED";
  readonly status: number;
  readonly details?: { retryAfterSeconds?: number };

  constructor(
    code:
      | "ACCESS_DENIED"
      | "WORKSPACE_NOT_FOUND"
      | "INVALID_REQUEST"
      | "PLAN_DOWNGRADE_FORBIDDEN"
      | "ALREADY_SUBMITTED"
      | "RATE_LIMITED"
      | "EMAIL_NOT_CONFIGURED"
      | "EMAIL_SEND_FAILED",
    status: number,
    message: string,
    details?: { retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "PlanChangeRequestServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type PlanChangeRequestInput = {
  workspaceId: string;
  actorUserId: string;
  requestedPlanTier: string;
  contactEmail: string;
  locale: string;
  region: string | null;
  /**
   * Expected seats / members from the form (integer ≥ 1).
   * Required on self-hosted; SaaS may omit (server falls back to live member count).
   */
  workspaceMemberCount?: number;
};

/** Sales-facing label: `saas` | `self-hosted`. */
export function salesDeploymentLabel(mode: DeploymentMode): "saas" | "self-hosted" {
  return mode === "saas" ? "saas" : "self-hosted";
}

export function planChangeRequestWindowRedisKey(workspaceId: string): string {
  return `plan-change-request:window:${workspaceId}`;
}

type RateLimitRedis = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
};

export class PlanChangeRequestService {
  private readonly db: QueryExecutor;
  private readonly workspaces: Pick<
    WorkspacesRepository,
    "findById" | "countMembers" | "markPlanChangeRequestSent"
  >;
  private readonly users: Pick<UsersRepository, "loadAccountProfile">;
  private readonly emailTemplates: Pick<EmailTemplateService, "sendPlanChangeRequest">;
  private readonly redis: RateLimitRedis;
  private readonly salesEmail: string;
  private readonly salesEmailDeliverable: boolean;
  private readonly deploymentMode: DeploymentMode;
  private readonly publicAppBaseUrl: string;

  constructor(deps: {
    db: QueryExecutor;
    workspaces: Pick<
      WorkspacesRepository,
      "findById" | "countMembers" | "markPlanChangeRequestSent"
    >;
    users: Pick<UsersRepository, "loadAccountProfile">;
    emailTemplates: Pick<EmailTemplateService, "sendPlanChangeRequest">;
    redis: RateLimitRedis;
    salesEmail: string;
    /**
     * When false (`EMAIL_PROVIDER=logger` or incomplete transport config),
     * submit is rejected and clients should use mailto instead.
     */
    salesEmailDeliverable?: boolean;
    deploymentMode: DeploymentMode;
    publicAppBaseUrl?: string;
  }) {
    this.db = deps.db;
    this.workspaces = deps.workspaces;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.redis = deps.redis;
    this.salesEmail = deps.salesEmail.trim();
    this.salesEmailDeliverable = deps.salesEmailDeliverable ?? true;
    this.deploymentMode = deps.deploymentMode;
    this.publicAppBaseUrl = (deps.publicAppBaseUrl ?? "").trim().replace(/\/$/, "");
  }

  async getStatus(input: {
    workspaceId: string;
    actorUserId: string;
  }): Promise<{
    submitted: boolean;
    sentAt: string | null;
    salesEmailDeliverable: boolean;
    salesEmail: string;
  }> {
    try {
      await assertWorkspacePermission(
        this.db,
        input.workspaceId,
        input.actorUserId,
        "billing",
        "get",
      );
    } catch {
      throw new PlanChangeRequestServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      throw new PlanChangeRequestServiceError(
        "WORKSPACE_NOT_FOUND",
        404,
        "workspace not found",
      );
    }

    const salesEmailDeliverable = this.isSalesEmailDeliverable();
    // Already-sent / no-resend only applies when outbound email is deliverable (real SMTP).
    // Logger / mailto path always reports not submitted so clients keep showing mailto.
    const submitted =
      salesEmailDeliverable && workspace.planChangeRequestSentAt != null;
    return {
      submitted,
      sentAt: submitted ? workspace.planChangeRequestSentAt : null,
      salesEmailDeliverable,
      salesEmail: this.salesEmail,
    };
  }

  private isSalesEmailDeliverable(): boolean {
    return Boolean(this.salesEmail) && this.salesEmailDeliverable;
  }

  private async consumeDailyRateLimit(workspaceId: string): Promise<void> {
    const key = planChangeRequestWindowRedisKey(workspaceId);
    // Every attempt counts (including rejected 429s after the limit).
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, PLAN_CHANGE_REQUEST_WINDOW_SECONDS);
    }
    if (count > PLAN_CHANGE_REQUEST_DAILY_LIMIT) {
      const ttl = await this.redis.ttl(key);
      const retryAfterSeconds =
        ttl > 0 ? ttl : PLAN_CHANGE_REQUEST_WINDOW_SECONDS;
      throw new PlanChangeRequestServiceError(
        "RATE_LIMITED",
        429,
        "license request rate limit exceeded",
        { retryAfterSeconds },
      );
    }
  }

  async submit(input: PlanChangeRequestInput): Promise<{ submitted: true }> {
    if (!this.isSalesEmailDeliverable()) {
      throw new PlanChangeRequestServiceError(
        "EMAIL_NOT_CONFIGURED",
        503,
        this.salesEmail
          ? "outbound email is not deliverable; use mailto"
          : "sales email is not configured",
      );
    }

    const contactEmail = input.contactEmail.trim();
    if (!contactEmail.includes("@") || contactEmail.length > 320) {
      throw new PlanChangeRequestServiceError(
        "INVALID_REQUEST",
        400,
        "contact email is invalid",
      );
    }

    if (!isPlanTier(input.requestedPlanTier)) {
      throw new PlanChangeRequestServiceError(
        "INVALID_REQUEST",
        400,
        "requested plan tier is invalid",
      );
    }
    const requestedPlanTier = input.requestedPlanTier as PlanTier;

    const locale =
      input.locale === "ru" || input.locale === "en" ? input.locale : "en";

    const rawMemberCount = input.workspaceMemberCount;
    const clientMemberCountValid =
      typeof rawMemberCount === "number" &&
      Number.isInteger(rawMemberCount) &&
      Number.isSafeInteger(rawMemberCount) &&
      rawMemberCount >= 1;

    if (this.deploymentMode !== "saas" && !clientMemberCountValid) {
      throw new PlanChangeRequestServiceError(
        "INVALID_REQUEST",
        400,
        "workspace member count must be an integer >= 1",
      );
    }

    try {
      await assertWorkspacePermission(
        this.db,
        input.workspaceId,
        input.actorUserId,
        "billing",
        "put",
      );
    } catch {
      throw new PlanChangeRequestServiceError("ACCESS_DENIED", 403, "access denied");
    }

    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) {
      throw new PlanChangeRequestServiceError(
        "WORKSPACE_NOT_FOUND",
        404,
        "workspace not found",
      );
    }

    // Re-send is allowed (up to the daily limit): each successful submit updates
    // `plan_change_request_sent_at` so the UI can show the latest datetime and “Send again”.

    const currentPlanTier = normalizePlanTier(workspace.planTier);
    // Self-hosted license purchase is not a SaaS catalog upgrade: Core FREE UI ignores DB
    // `plan_tier` (modules gate). Skip the ladder so ENTERPRISE→ENTERPRISE license requests work.
    if (
      this.deploymentMode === "saas" &&
      !canRequestPlanUpgrade(currentPlanTier, requestedPlanTier)
    ) {
      throw new PlanChangeRequestServiceError(
        "PLAN_DOWNGRADE_FORBIDDEN",
        400,
        "requested plan must be higher than the current plan",
      );
    }

    await this.consumeDailyRateLimit(input.workspaceId);

    const profile = await this.users.loadAccountProfile(input.actorUserId);
    const regionFromProfile =
      profile?.billingRegion && /^[A-Z]{2}$/.test(profile.billingRegion)
        ? profile.billingRegion
        : null;
    const regionFromInput =
      input.region && /^[A-Z]{2}$/.test(input.region) ? input.region : null;
    const region = regionFromProfile ?? regionFromInput;

    const workspaceMemberCount = clientMemberCountValid
      ? (rawMemberCount as number)
      : await this.workspaces.countMembers(input.workspaceId);
    const workspaceUrl = this.publicAppBaseUrl;

    try {
      await this.emailTemplates.sendPlanChangeRequest({
        to: this.salesEmail,
        localeHints: {
          userLocale: profile?.locale ?? null,
          explicitLocale: locale,
        },
        variables: {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceUrl,
          currentPlanTier,
          requestedPlanTier,
          contactEmail,
          accountEmail: profile?.email ?? contactEmail,
          locale,
          region: region ?? "",
          workspaceMemberCount,
          deploymentMode: salesDeploymentLabel(this.deploymentMode),
          actorUserId: input.actorUserId,
        },
      });
    } catch (error) {
      throw new PlanChangeRequestServiceError(
        "EMAIL_SEND_FAILED",
        503,
        error instanceof Error ? error.message : "email send failed",
      );
    }

    await this.workspaces.markPlanChangeRequestSent(input.workspaceId);

    return { submitted: true };
  }
}
