import { AuthError, type AuthService } from "../auth/service.ts";
import { EmailTemplateError, toPublicEmailErrorResponse } from "../email/errors.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { requestClientIp } from "../request-ip.ts";


interface StartBody {
  email?: string;
  locale?: string;
}

interface ConfirmBody {
  challengeId?: string;
  code?: string;
}

interface ResendBody {
  challengeId?: string;
  locale?: string;
}

export function createAuthEmailStartRoute(
  authService: AuthService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    let body: StartBody;
    try {
      body = await readJsonBody<StartBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    const email = body.email?.trim();
    if (!email) {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "email is required", ctx.requestId));
      return;
    }

    try {
      const result = await authService.startEmailLogin({
        email,
        locale: body.locale,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAuthEmailResendRoute(
  authService: AuthService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    let body: ResendBody;
    try {
      body = await readJsonBody<ResendBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.challengeId) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "challengeId is required", ctx.requestId),
      );
      return;
    }

    try {
      const result = await authService.resendEmailCode({
        challengeId: body.challengeId,
        locale: body.locale,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAuthEmailConfirmRoute(
  authService: AuthService,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    let body: ConfirmBody;
    try {
      body = await readJsonBody<ConfirmBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    if (!body.challengeId || !body.code) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "challengeId and code are required", ctx.requestId),
      );
      return;
    }

    try {
      const result = await authService.confirmEmailCode({
        challengeId: body.challengeId,
        code: body.code,
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleAuthError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof AuthError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (error instanceof EmailTemplateError) {
    const publicError = toPublicEmailErrorResponse(error);
    json(res, 503, {
      error: publicError.error,
      message: publicError.message,
      requestId,
    });
    return;
  }

  json(
    res,
    500,
    errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId),
  );
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
