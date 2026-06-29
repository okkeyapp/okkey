import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  parseDeletedItemsRetentionDaysPayload,
  WorkspaceSettingsService,
  WorkspaceSettingsServiceError,
} from "../workspace-settings/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type WorkspaceSettingsBody = {
  deleted_items_retention_days?: unknown;
};

export function createWorkspaceSettingsRoute(
  service: WorkspaceSettingsService,
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
      json(ctx.res, 400, errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId));
      return;
    }

    try {
      if (ctx.req.method === "GET") {
        const settings = await service.getSettings(workspaceId, userId);
        json(ctx.res, 200, {
          deleted_items_retention_days: settings.deletedItemsRetentionDays,
        });
        return;
      }

      const body = await readJsonBody<WorkspaceSettingsBody>(ctx.req);
      const retentionDays = parseDeletedItemsRetentionDaysPayload(body.deleted_items_retention_days);
      if (retentionDays === null) {
        json(
          ctx.res,
          400,
          errorPayload(
            "INVALID_RETENTION_DAYS",
            "deleted_items_retention_days must be an integer between 1 and 3650",
            ctx.requestId,
          ),
        );
        return;
      }

      const updated = await service.updateSettings(workspaceId, userId, retentionDays);
      json(ctx.res, 200, {
        deleted_items_retention_days: updated.deletedItemsRetentionDays,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WorkspaceSettingsServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}
