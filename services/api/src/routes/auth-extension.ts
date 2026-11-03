import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  ExtensionAuthError,
  type ExtensionAuthService,
} from "../extension-auth/service.ts";
import type { IncomingMessage } from "node:http";

interface IssueCodeBody {
  client_id?: string;
  clientId?: string;
  redirect_uri?: string;
  redirectUri?: string;
  code_challenge?: string;
  codeChallenge?: string;
  code_challenge_method?: string;
  codeChallengeMethod?: string;
}

interface ExchangeBody {
  client_id?: string;
  clientId?: string;
  redirect_uri?: string;
  redirectUri?: string;
  code?: string;
  code_verifier?: string;
  codeVerifier?: string;
}

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function handleExtensionAuthError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof ExtensionAuthError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

/**
 * Authenticated: mint a short-lived auth_code for the extension PKCE flow.
 * A full session that has not bound a device yet is enough — vault unlock and
 * device bind happen after the extension receives its own session.
 */
export function createExtensionAuthIssueCodeRoute(
  extensionAuthService: ExtensionAuthService,
  resolveSession: (req: IncomingMessage) => Promise<{
    userId: string;
    deviceId: string | null;
    tokenHash: string;
    expiresAt: string | null;
  } | null>,
  isDeviceTrusted: (userId: string, deviceId: string) => Promise<boolean>,
): RouteHandler {
  return async (ctx) => {
    const session = await resolveSession(ctx.req);
    if (!session?.userId) {
      json(ctx.res, 401, errorPayload("UNAUTHORIZED", "authentication required", ctx.requestId));
      return;
    }

    let expiresAtCap: string | null = null;
    const realBearer = session.tokenHash !== "";
    if (realBearer) {
      const trusted = session.deviceId
        ? await isDeviceTrusted(session.userId, session.deviceId)
        : false;
      if (!trusted) {
        if (!session.expiresAt) {
          json(ctx.res, 401, errorPayload("UNAUTHORIZED", "authentication required", ctx.requestId));
          return;
        }
        expiresAtCap = session.expiresAt;
      }
    }

    let body: IssueCodeBody;
    try {
      body = await readJsonBody<IssueCodeBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("EXTENSION_AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    try {
      const result = await extensionAuthService.issueAuthCode({
        userId: session.userId,
        clientId: body.client_id?.trim() ?? body.clientId?.trim() ?? "",
        redirectUri: body.redirect_uri?.trim() ?? body.redirectUri?.trim() ?? "",
        codeChallenge: body.code_challenge?.trim() ?? body.codeChallenge?.trim() ?? "",
        codeChallengeMethod:
          body.code_challenge_method?.trim() ?? body.codeChallengeMethod?.trim(),
        expiresAtCap,
      });
      json(ctx.res, 200, {
        code: result.code,
        expires_at: result.expiresAt,
        expires_in: result.expiresIn,
      });
    } catch (error) {
      handleExtensionAuthError(ctx.requestId, ctx.res, error);
    }
  };
}

/** Public: exchange auth_code + PKCE verifier for a Bearer access token (session only). */
export function createExtensionAuthTokenRoute(
  extensionAuthService: ExtensionAuthService,
): RouteHandler {
  return async (ctx) => {
    let body: ExchangeBody;
    try {
      body = await readJsonBody<ExchangeBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("EXTENSION_AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }

    try {
      const result = await extensionAuthService.exchangeAuthCode({
        clientId: body.client_id?.trim() ?? body.clientId?.trim() ?? "",
        redirectUri: body.redirect_uri?.trim() ?? body.redirectUri?.trim() ?? "",
        code: body.code?.trim() ?? "",
        codeVerifier: body.code_verifier?.trim() ?? body.codeVerifier?.trim() ?? "",
      });
      json(ctx.res, 200, {
        access_token: result.accessToken,
        expires_at: result.expiresAt,
        user_id: result.userId,
        token_type: result.tokenType,
      });
    } catch (error) {
      handleExtensionAuthError(ctx.requestId, ctx.res, error);
    }
  };
}
