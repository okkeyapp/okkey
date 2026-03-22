import { json, readJsonBody, type RouteHandler } from "../http.ts";
import { TwoFactorError, type TwoFactorService } from "../two-factor/service.ts";

interface BootstrapBody {
  authStateId?: string;
  auth_state_id?: string;
}

export function createAuthSessionBootstrapRoute(twoFactorService: TwoFactorService): RouteHandler {
  return async (ctx) => {
    let body: BootstrapBody;
    try {
      body = await readJsonBody<BootstrapBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    const authStateId = body.authStateId?.trim() ?? body.auth_state_id?.trim();
    if (!authStateId) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "authStateId is required", ctx.requestId),
      );
      return;
    }

    try {
      const result = await twoFactorService.bootstrapSessionAfterEmail({
        authStateId,
      });
      json(ctx.res, 200, {
        access_token: result.accessToken,
        expires_at: result.expiresAt,
        user_id: result.userId,
        token_type: result.tokenType,
      });
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof TwoFactorError) {
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
  return { error: code, message, requestId };
}
