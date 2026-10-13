import type { IncomingMessage } from "node:http";

import type { AccountRecoveryService } from "../account-recovery/service.ts";
import { json, type RouteHandler } from "../http.ts";

export const RECOVERY_KEY_REQUIRED_CODE = "RECOVERY_KEY_REQUIRED";

/** Vault and item routes require a saved recovery key. */
export function requireEnrolledRecoveryKey(
  service: Pick<AccountRecoveryService, "hasEnrolledRecoveryKey">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  handler: RouteHandler,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      await handler(ctx);
      return;
    }
    const enrolled = await service.hasEnrolledRecoveryKey(userId);
    if (!enrolled) {
      json(ctx.res, 403, {
        error: RECOVERY_KEY_REQUIRED_CODE,
        message: "Save a recovery key before using the vault",
        requestId: ctx.requestId,
      });
      return;
    }
    await handler(ctx);
  };
}
