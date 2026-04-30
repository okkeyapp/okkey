import { EmailChangeError, type EmailChangeService } from "../account/email-change.ts";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { EmailTemplateError } from "../email/errors.ts";

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
        requestIp: getRequestIp(ctx.req),
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
        requestIp: getRequestIp(ctx.req),
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
        requestIp: getRequestIp(ctx.req),
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
    json(res, 503, {
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
