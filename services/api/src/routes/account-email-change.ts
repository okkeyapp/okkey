import { EmailChangeError, type EmailChangeService } from "../account/email-change.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { EmailTemplateError, toPublicEmailErrorResponse } from "../email/errors.ts";

import { requestClientIp } from "../request-ip.ts";

interface StartBody {
  email?: string;
  locale?: string;
}

interface ResendBody {
  challengeId?: string;
  locale?: string;
}

interface ConfirmBody {
  challengeId?: string;
  code?: string;
}

type ResolveUserId = (req: Parameters<typeof getHeader>[0]) => Promise<string | null>;

async function requireUserId(ctx: Parameters<RouteHandler>[0], resolveUserId: ResolveUserId): Promise<string | null> {
  const userId = await resolveUserId(ctx.req);
  if (!userId) {
    json(ctx.res, 401, errorPayload("UNAUTHORIZED", "authentication required", ctx.requestId));
    return null;
  }
  return userId;
}

export function createAccountEmailChangeStartRoute(
  service: EmailChangeService,
  resolveUserId: ResolveUserId,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const userId = await requireUserId(ctx, resolveUserId);
    if (!userId) return;

    let body: StartBody;
    try {
      body = await readJsonBody<StartBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("EMAIL_CHANGE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    try {
      const result = await service.start({
        userId,
        email: body.email ?? "",
        locale: body.locale,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleEmailChangeError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountEmailChangeResendRoute(
  service: EmailChangeService,
  resolveUserId: ResolveUserId,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const userId = await requireUserId(ctx, resolveUserId);
    if (!userId) return;

    let body: ResendBody;
    try {
      body = await readJsonBody<ResendBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("EMAIL_CHANGE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.challengeId) {
      json(ctx.res, 400, errorPayload("EMAIL_CHANGE_BAD_REQUEST", "challengeId is required", ctx.requestId));
      return;
    }

    try {
      const result = await service.resend({
        userId,
        challengeId: body.challengeId,
        locale: body.locale,
        acceptLanguage: getHeader(ctx.req, "accept-language"),
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleEmailChangeError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAccountEmailChangeConfirmRoute(
  service: EmailChangeService,
  resolveUserId: ResolveUserId,
  trustedProxyHops = 0,
): RouteHandler {
  return async (ctx) => {
    const userId = await requireUserId(ctx, resolveUserId);
    if (!userId) return;

    let body: ConfirmBody;
    try {
      body = await readJsonBody<ConfirmBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("EMAIL_CHANGE_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.challengeId || !body.code) {
      json(ctx.res, 400, errorPayload("EMAIL_CHANGE_BAD_REQUEST", "challengeId and code are required", ctx.requestId));
      return;
    }

    try {
      const result = await service.confirm({
        userId,
        challengeId: body.challengeId,
        code: body.code,
        requestIp: requestClientIp(ctx.req, trustedProxyHops),
      });
      json(ctx.res, 200, result);
    } catch (error) {
      handleEmailChangeError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleEmailChangeError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof EmailChangeError) {
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

  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}
