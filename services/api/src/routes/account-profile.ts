import type { IncomingMessage } from "node:http";
import { json, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

export function createAccountProfileRoute(
  users: Pick<UsersRepository, "loadAccountProfile">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const row = await users.loadAccountProfile(userId);
    if (!row) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }
    json(ctx.res, 200, {
      email: row.email,
      first_name: row.firstName,
      last_name: row.lastName,
      vault_idle_lock_seconds: row.vaultIdleLockSeconds,
    });
  };
}
