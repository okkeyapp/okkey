import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { VaultService, VaultServiceError } from "../vault/service.ts";

export function createWorkspaceVaultsListRoute(
  vaultService: VaultService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
      json(ctx.res, 200, vaults);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultGetRoute(
  vaultService: VaultService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const vault = await vaultService.getVault(vaultId, userId);
      json(ctx.res, 200, vault);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultUpdateRoute(
  vaultService: VaultService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const vault = await vaultService.updateVault(vaultId, userId, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
      });
      json(ctx.res, 200, vault);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleVaultError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof VaultServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }

  console.error("[vault] unexpected error", requestId, error);
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
