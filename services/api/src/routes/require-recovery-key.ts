import type { IncomingMessage } from "node:http";

import type { AccountRecoveryService } from "../account-recovery/service.ts";
import { json, type RouteHandler } from "../http.ts";

export const RECOVERY_KEY_REQUIRED_CODE = "RECOVERY_KEY_REQUIRED";

/** Vault, item, and capsule routes require a saved and exported recovery key. */
export function requireEnrolledRecoveryKey(
  service: Pick<AccountRecoveryService, "hasExportedRecoveryKey">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
  handler: RouteHandler,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      await handler(ctx);
      return;
    }
    const ready = await service.hasExportedRecoveryKey(userId);
    if (!ready) {
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
