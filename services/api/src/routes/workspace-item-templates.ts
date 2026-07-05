import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { ItemTemplatesService, ItemTemplatesServiceError } from "../item-templates/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type CreateTemplateBody = {
  name?: unknown;
  category_id?: unknown;
  payload?: unknown;
  favicon_id?: unknown;
};

export function createWorkspaceItemTemplatesListRoute(
  service: ItemTemplatesService,
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
      const templates = await service.list(workspaceId, userId);
      json(ctx.res, 200, { templates });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWorkspaceItemTemplatesCreateRoute(
  service: ItemTemplatesService,
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

    let body: CreateTemplateBody;
    try {
      body = (await readJsonBody(ctx.req)) as CreateTemplateBody;
    } catch {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "invalid JSON body", ctx.requestId));
      return;
    }

    const name = typeof body.name === "string" ? body.name : "";
    const categoryId = typeof body.category_id === "string" ? body.category_id : "";
    const payload = body.payload;
    const faviconId = typeof body.favicon_id === "string" ? body.favicon_id : undefined;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      json(ctx.res, 400, errorPayload("INVALID_PAYLOAD", "payload must be an object", ctx.requestId));
      return;
    }

    try {
      const template = await service.create(workspaceId, userId, {
        name,
        category_id: categoryId,
        payload: payload as {
          record_name: string;
          vault_id: string;
          folder_id: string;
          sections: unknown[];
          tags: string[];
          favicon_source?: string;
        },
        favicon_id: faviconId,
      });
      json(ctx.res, 201, { template });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleError(requestId: string, res: Parameters<typeof json>[0], error: unknown): void {
  if (error instanceof ItemTemplatesServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

export function createWorkspaceItemTemplatesDeleteRoute(
  service: ItemTemplatesService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const workspaceId = ctx.params.workspaceId?.trim() ?? "";
    const templateId = ctx.params.templateId?.trim() ?? "";
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId));
      return;
    }
    if (!templateId) {
      json(ctx.res, 400, errorPayload("INVALID_TEMPLATE_ID", "template id is required", ctx.requestId));
      return;
    }

    try {
      await service.delete(workspaceId, userId, templateId);
      json(ctx.res, 200, { ok: true });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}
