import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  PlanChangeRequestService,
  PlanChangeRequestServiceError,
} from "../plan-change-request/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type PlanChangeRequestBody = {
  requested_plan_tier?: unknown;
  contact_email?: unknown;
  locale?: unknown;
  region?: unknown;
};

export function createWorkspacePlanChangeRequestRoute(
  service: PlanChangeRequestService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const workspaceId = ctx.params.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      json(
        ctx.res,
        400,
        errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId),
      );
      return;
    }

    let body: PlanChangeRequestBody;
    try {
      body = (await readJsonBody(ctx.req)) as PlanChangeRequestBody;
    } catch {
      json(ctx.res, 400, errorPayload("INVALID_JSON", "invalid json body", ctx.requestId));
      return;
    }

    const requestedPlanTier =
      typeof body.requested_plan_tier === "string" ? body.requested_plan_tier.trim() : "";
    const contactEmail =
      typeof body.contact_email === "string" ? body.contact_email.trim() : "";
    const locale = typeof body.locale === "string" ? body.locale.trim() : "en";
    const regionRaw =
      body.region === null
        ? null
        : typeof body.region === "string"
          ? body.region.trim().toUpperCase()
          : "";
    const region = regionRaw === "" ? null : regionRaw;

    try {
      const result = await service.submit({
        workspaceId,
        actorUserId: userId,
        requestedPlanTier,
        contactEmail,
        locale,
        region,
      });
      json(ctx.res, 200, result);
    } catch (error) {
      if (error instanceof PlanChangeRequestServiceError) {
        json(ctx.res, error.status, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      throw error;
    }
  };
}
