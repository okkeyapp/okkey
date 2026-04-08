import type { IncomingMessage } from "node:http";
import {
  VaultUnlockBootstrapError,
  VaultUnlockBootstrapService,
} from "../account/vault-unlock-bootstrap.ts";
import { getHeader, json, type RouteHandler } from "../http.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function parseDeviceFingerprint(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get("device_fingerprint")?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function createVaultUnlockBootstrapRoute(
  service: VaultUnlockBootstrapService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const fingerprint = parseDeviceFingerprint(ctx.req);
      const body = await service.getForUser(userId, fingerprint);
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
