import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import { VaultService, VaultServiceError } from "../vault/service.ts";

export function createWorkspacesListRoute(
  vaultService: VaultService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const workspaces = await vaultService.listAccessibleWorkspaces(userId);
      json(ctx.res, 200, workspaces);
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
