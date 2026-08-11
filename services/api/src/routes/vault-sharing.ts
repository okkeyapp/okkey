import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import { VaultSharingService, VaultSharingServiceError } from "../vault-sharing/service.ts";

export function createVaultKeyGetRoute(
  sharingService: VaultSharingService,
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
      const payload = await sharingService.getUserVaultKey(vaultId, userId);
      json(ctx.res, 200, payload);
    } catch (error) {
      handleSharingError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleSharingError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof VaultSharingServiceError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
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
