import { AuthError, type AuthService } from "../auth/service.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";

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

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

function getRequestIp(req: Parameters<typeof getHeader>[0]): string {
  return requestIpFromHeaders(getHeader(req, "x-forwarded-for"));
}

export function createAuthEmailStartRoute(authService: AuthService): RouteHandler {
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
        requestIp: getRequestIp(ctx.req),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAuthEmailResendRoute(authService: AuthService): RouteHandler {
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
        requestIp: getRequestIp(ctx.req),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAuthEmailConfirmRoute(authService: AuthService): RouteHandler {
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
        requestIp: getRequestIp(ctx.req),
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
