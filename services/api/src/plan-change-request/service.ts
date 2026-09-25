import {
  canRequestPlanUpgrade,
  isPlanTier,
  normalizePlanTier,
  type PlanTier,
} from "@okkey/types";

import { assertWorkspacePermission } from "../workspace-roles/permissions.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { UsersRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { EmailTemplateService } from "../email/service.ts";

export class PlanChangeRequestServiceError extends Error {
  readonly code:
    | "ACCESS_DENIED"
    | "WORKSPACE_NOT_FOUND"
    | "INVALID_REQUEST"
    | "PLAN_DOWNGRADE_FORBIDDEN"
    | "EMAIL_NOT_CONFIGURED"
    | "EMAIL_SEND_FAILED";
  readonly status: number;

  constructor(
    code:
      | "ACCESS_DENIED"
      | "WORKSPACE_NOT_FOUND"
      | "INVALID_REQUEST"
      | "PLAN_DOWNGRADE_FORBIDDEN"
      | "EMAIL_NOT_CONFIGURED"
      | "EMAIL_SEND_FAILED",
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlanChangeRequestServiceError";
    this.code = code;
    this.status = status;
  }
}

export type PlanChangeRequestInput = {
  workspaceId: string;
  actorUserId: string;
  requestedPlanTier: string;
  contactEmail: string;
  locale: string;
  region: string | null;
};

export class PlanChangeRequestService {
  private readonly db: QueryExecutor;
  private readonly workspaces: Pick<WorkspacesRepository, "findById">;
  private readonly users: Pick<UsersRepository, "loadAccountProfile">;
  private readonly emailTemplates: Pick<EmailTemplateService, "sendPlanChangeRequest">;
  private readonly salesEmail: string;

  constructor(deps: {
    db: QueryExecutor;
    workspaces: Pick<WorkspacesRepository, "findById">;
    users: Pick<UsersRepository, "loadAccountProfile">;
    emailTemplates: Pick<EmailTemplateService, "sendPlanChangeRequest">;
    salesEmail: string;
  }) {
    this.db = deps.db;
    this.workspaces = deps.workspaces;
    this.users = deps.users;
    this.emailTemplates = deps.emailTemplates;
    this.salesEmail = deps.salesEmail.trim();
  }

  async submit(input: PlanChangeRequestInput): Promise<{ submitted: true }> {
    if (!this.salesEmail) {
      throw new PlanChangeRequestServiceError(
        "EMAIL_NOT_CONFIGURED",
        503,
        "sales email is not configured",
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
    const region =
      input.region && /^[A-Z]{2}$/.test(input.region) ? input.region : null;

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

    const currentPlanTier = normalizePlanTier(workspace.planTier);
    if (!canRequestPlanUpgrade(currentPlanTier, requestedPlanTier)) {
      throw new PlanChangeRequestServiceError(
        "PLAN_DOWNGRADE_FORBIDDEN",
        400,
        "requested plan must be higher than the current plan",
      );
    }

    const profile = await this.users.loadAccountProfile(input.actorUserId);

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
          currentPlanTier,
          requestedPlanTier,
          contactEmail,
          accountEmail: profile?.email ?? contactEmail,
          locale,
          region: region ?? "",
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

    return { submitted: true };
  }
}
