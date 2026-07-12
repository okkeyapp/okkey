import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  parseDeletedItemsRetentionDaysPayload,
  parseOptionalNamePayload,
  parseOptionalStringPayload,
  WorkspaceSettingsService,
  WorkspaceSettingsServiceError,
} from "../workspace-settings/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type WorkspaceSettingsBody = {
  name?: unknown;
  deleted_items_retention_days?: unknown;
  tile_color?: unknown;
  logo_vault_id?: unknown;
  logo_attachment_id?: unknown;
};

type WorkspaceDeleteBody = {
  confirmation_name?: unknown;
};

function serializeSettings(settings: {
  name: string;
  deletedItemsRetentionDays: number;
  tileColor: string | null;
  logoVaultId: string | null;
  logoAttachmentId: string | null;
}) {
  return {
    name: settings.name,
    deleted_items_retention_days: settings.deletedItemsRetentionDays,
    tile_color: settings.tileColor,
    logo_vault_id: settings.logoVaultId,
    logo_attachment_id: settings.logoAttachmentId,
  };
}

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
        json(ctx.res, 200, serializeSettings(settings));
        return;
      }

      if (ctx.req.method === "DELETE") {
        const body = await readJsonBody<WorkspaceDeleteBody>(ctx.req);
        const confirmationName =
          typeof body.confirmation_name === "string" ? body.confirmation_name : "";
        await service.deleteWorkspace(workspaceId, userId, confirmationName);
        json(ctx.res, 200, { ok: true });
        return;
      }

      const body = await readJsonBody<WorkspaceSettingsBody>(ctx.req);
      const patch: {
        name?: string;
        deletedItemsRetentionDays?: number;
        tileColor?: string | null;
        logoVaultId?: string | null;
        logoAttachmentId?: string | null;
      } = {};

      const name = parseOptionalNamePayload(body.name);
      if (name !== undefined) {
        patch.name = name;
      }

      if (body.deleted_items_retention_days !== undefined) {
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
        patch.deletedItemsRetentionDays = retentionDays;
      }

      const tileColor = parseOptionalStringPayload(body.tile_color);
      if (tileColor !== undefined) {
        patch.tileColor = tileColor;
      }
      const logoVaultId = parseOptionalStringPayload(body.logo_vault_id);
      if (logoVaultId !== undefined) {
        patch.logoVaultId = logoVaultId;
      }
      const logoAttachmentId = parseOptionalStringPayload(body.logo_attachment_id);
      if (logoAttachmentId !== undefined) {
        patch.logoAttachmentId = logoAttachmentId;
      }

      const updated = await service.updateSettings(workspaceId, userId, patch);
      json(ctx.res, 200, serializeSettings(updated));
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
