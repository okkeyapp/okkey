import type { IncomingMessage } from "node:http";

import { createLoginVerifier, decodeLoginKey } from "../crypto/login-verifier.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type VerifierUsers = Pick<
  UsersRepository,
  "isLoginVerifierEnrolled" | "setLoginVerifier"
>;

/** `GET /account/login-verifier` — whether this account has enrolled a login key. */
export function createLoginVerifierStatusRoute(
  users: Pick<UsersRepository, "isLoginVerifierEnrolled">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const enrolled = await users.isLoginVerifierEnrolled(userId);
    json(ctx.res, 200, { enrolled });
  };
}

/**
 * `POST /account/login-verifier`
 * Stores a slow hash of the login key. Used after a successful emailed-code
 * login for accounts that have no verifier yet, and to refresh one.
 */
export function createLoginVerifierEnrollRoute(
  users: VerifierUsers,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    let body: { login_key?: unknown; loginKey?: unknown };
    try {
      body = await readJsonBody(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    const loginKey = decodeLoginKey(body.login_key !== undefined ? body.login_key : body.loginKey);
    if (!loginKey) {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "login_key must be 32 bytes", ctx.requestId));
      return;
    }

    const material = createLoginVerifier(loginKey);
    const stored = await users.setLoginVerifier(userId, material);
    if (!stored) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }
    json(ctx.res, 200, { enrolled: true });
  };
}
