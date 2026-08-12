import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

/**
 * `POST /account/vault-unlock` — client reports a successful master-password vault unlock.
 * Does not accept or store any secrets; only updates `users.last_vault_unlocked_at`.
 */
export function createAccountVaultUnlockRoute(
  users: Pick<UsersRepository, "recordVaultUnlock">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const updated = await users.recordVaultUnlock(userId);
    if (!updated) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }
    json(ctx.res, 200, { recorded: true });
  };
}
