import { AuthError, type AuthService } from "../auth/service.ts";
import { decodeLoginKey } from "../crypto/login-verifier.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { requestClientIp } from "../request-ip.ts";

interface LoginBody {
  email?: unknown;
  loginKey?: unknown;
  login_key?: unknown;
}

/**
 * `POST /auth/login/master-password`
 *
 * Accepts a 32-byte login key (base64). The master password is not a field
 * and is ignored if a client sends one by mistake.
 */
export function createAuthMasterPasswordLoginRoute(
  authService: AuthService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    let body: LoginBody;
    try {
      body = await readJsonBody<LoginBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "email is required", ctx.requestId));
      return;
    }

    const encoded = body.loginKey !== undefined ? body.loginKey : body.login_key;
    const loginKey = decodeLoginKey(encoded);
    if (!loginKey) {
      json(ctx.res, 401, errorPayload("AUTH_LOGIN_FAILED", "sign-in failed", ctx.requestId));
      return;
    }

    try {
      const result = await authService.loginWithMasterPasswordProof({
        email,
        loginKey,
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, {
        authStateId: result.authStateId,
        userExists: result.userExists,
        nextStep: result.nextStep,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        json(ctx.res, error.statusCode, {
          error: error.code,
          message: error.message,
          requestId: ctx.requestId,
          ...(error.details ? { details: error.details } : {}),
        });
        return;
      }
      json(ctx.res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", ctx.requestId));
    }
  };
}

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}
