import type { IncomingMessage } from "node:http";
import {
  VaultUnlockBootstrapError,
  VaultUnlockBootstrapService,
} from "../account/vault-unlock-bootstrap.ts";
import { json, type RouteHandler } from "../http.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export function createVaultUnlockBootstrapRoute(
  service: VaultUnlockBootstrapService,
  resolveSession: (req: IncomingMessage) => Promise<{
    userId: string;
    deviceId: string | null;
  } | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const session = await resolveSession(ctx.req);
      if (!session?.userId || !session.deviceId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const body = await service.getForBoundDevice({
        userId: session.userId,
        deviceId: session.deviceId,
      });
      json(ctx.res, 200, body);
    } catch (error) {
      if (error instanceof VaultUnlockBootstrapError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      json(ctx.res, 500, errorPayload("INTERNAL_ERROR", "internal error", ctx.requestId));
    }
  };
}
