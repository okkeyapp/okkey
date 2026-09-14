import type { IncomingMessage } from "node:http";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { TwoFactorError, type TwoFactorService } from "../two-factor/service.ts";

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

function getRequestIp(req: IncomingMessage): string {
  return requestIpFromHeaders(getHeader(req, "x-forwarded-for"));
}

function errorPayload(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) {
  return {
    error: code,
    message,
    requestId,
    ...(details ? { details } : {}),
  };
}

function handleTwoFactorError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof TwoFactorError) {
    json(
      res,
      error.statusCode,
      errorPayload(error.code, error.message, requestId, error.details),
    );
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

interface VerifyBody {
  authStateId?: string;
  auth_state_id?: string;
  code?: string;
}

export function createTwoFactorVerifyRoute(
  twoFactorService: TwoFactorService,
): RouteHandler {
  return async (ctx) => {
    let body: VerifyBody;
    try {
      body = await readJsonBody<VerifyBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const authStateId = body.authStateId?.trim() ?? body.auth_state_id?.trim();
    const code = body.code?.trim();
    if (!authStateId || !code) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "authStateId and code are required", ctx.requestId),
      );
      return;
    }
    try {
      const result = await twoFactorService.verifyTwoFactorAndCreateSession({
        authStateId,
        code,
        requestIp: getRequestIp(ctx.req),
      });
      json(ctx.res, 200, {
        access_token: result.accessToken,
        expires_at: result.expiresAt,
        user_id: result.userId,
        token_type: result.tokenType,
      });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createTwoFactorStatusRoute(
  twoFactorService: TwoFactorService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const status = await twoFactorService.getStatus(userId);
      json(ctx.res, 200, {
        enabled: status.enabled,
        backupCodesRemaining: status.backupCodesRemaining,
        backupCodesGeneratedAt: status.backupCodesGeneratedAt,
      });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createTotpEnrollStartRoute(
  twoFactorService: TwoFactorService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await twoFactorService.enrollTotpStart(userId);
      json(ctx.res, 200, {
        enrollmentId: result.enrollmentId,
        secretBase32: result.secretBase32,
        otpauthUri: result.otpauthUri,
        periodSeconds: result.periodSeconds,
        digits: result.digits,
        algorithm: result.algorithm,
      });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}

interface EnrollConfirmBody {
  enrollmentId?: string;
  code?: string;
}

export function createTotpEnrollConfirmRoute(
  twoFactorService: TwoFactorService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: EnrollConfirmBody;
    try {
      body = await readJsonBody<EnrollConfirmBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.enrollmentId?.trim() || !body.code?.trim()) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "enrollmentId and code are required", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await twoFactorService.enrollTotpConfirm(
        userId,
        {
          enrollmentId: body.enrollmentId.trim(),
          code: body.code.trim(),
        },
        { acceptLanguage: getHeader(ctx.req, "accept-language") },
      );
      json(ctx.res, 200, { backupCodes: result.backupCodes });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}

interface RegenerateBody {
  totpCode?: string;
  totp_code?: string;
}

export function createBackupCodesRegenerateRoute(
  twoFactorService: TwoFactorService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: RegenerateBody;
    try {
      body = await readJsonBody<RegenerateBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const totpCode = body.totpCode?.trim() ?? body.totp_code?.trim();
    if (!totpCode) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "totpCode is required", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await twoFactorService.regenerateBackupCodes(userId, totpCode, {
        acceptLanguage: getHeader(ctx.req, "accept-language"),
      });
      json(ctx.res, 200, { backupCodes: result.backupCodes });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}

interface DisableBody {
  totpCode?: string;
  totp_code?: string;
  backupCode?: string;
  backup_code?: string;
}

export function createTwoFactorDisableRoute(
  twoFactorService: TwoFactorService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: DisableBody;
    try {
      body = await readJsonBody<DisableBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const totpCode = body.totpCode?.trim() ?? body.totp_code?.trim();
    const backupCode = body.backupCode?.trim() ?? body.backup_code?.trim();
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      await twoFactorService.disableTwoFactor(userId, { totpCode, backupCode });
      json(ctx.res, 200, { disabled: true });
    } catch (error) {
      handleTwoFactorError(ctx.requestId, ctx.res, error);
    }
  };
}
