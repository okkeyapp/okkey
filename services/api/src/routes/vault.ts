import { getHeader, json, type RouteHandler } from "../http.ts";
import { VaultService, VaultServiceError } from "../vault/service.ts";

function getUserId(ctx: Parameters<RouteHandler>[0]): string {
  const userId = getHeader(ctx.req, "x-user-id");
  if (!userId) {
    throw new VaultServiceError("AUTH_REQUIRED", 401, "auth required");
  }
  return userId;
}

export function createWorkspaceVaultsListRoute(vaultService: VaultService): RouteHandler {
  return async (ctx) => {
    const workspaceId = ctx.params.workspaceId;
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "workspaceId is required", ctx.requestId));
      return;
    }

    try {
      const userId = getUserId(ctx);
      const vaults = await vaultService.listWorkspaceVaults(workspaceId, userId);
      json(ctx.res, 200, vaults);
    } catch (error) {
      handleVaultError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createVaultGetRoute(vaultService: VaultService): RouteHandler {
  return async (ctx) => {
    const vaultId = ctx.params.vaultId;
    if (!vaultId) {
      json(ctx.res, 400, errorPayload("BAD_REQUEST", "vaultId is required", ctx.requestId));
      return;
    }

    try {
      const userId = getUserId(ctx);
      const vault = await vaultService.getVault(vaultId, userId);
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

  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
