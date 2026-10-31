import type { IncomingMessage } from "node:http";
import type { ApiConfig } from "../config.ts";
import type { ResolvedAccessToken, SessionService } from "../session/service.ts";
import {
  isFullSessionScope,
  sessionScopeAllowed,
  SESSION_SCOPE_FULL,
  SESSION_SCOPE_REGISTRATION_RECOVERY,
} from "../session/scopes.ts";
import { getHeader } from "../http.ts";

export type ResolveAuthenticatedUserId = (req: IncomingMessage) => Promise<string | null>;

export type ResolveAuthenticatedSession = (
  req: IncomingMessage,
) => Promise<ResolvedAccessToken | null>;

/**
 * Resolve Bearer to a session (scope + device). Optional X-User-Id only when enabled
 * and no Bearer was presented — treated as a full unbound session for local tooling.
 */
export type AuthenticatedSessionOptions = {
  /**
   * When false (default), a full Bearer session with no device_id is not usable.
   * List/register stay open so the client can bind. Header-user auth is unchanged.
   */
  allowUnboundDevice?: boolean;
};

function fullSessionIsBound(resolved: ResolvedAccessToken): boolean {
  return resolved.deviceId != null && resolved.deviceId !== "";
}

export function createResolveAuthenticatedSession(
  config: Pick<ApiConfig, "allowHeaderUserIdAuth">,
  sessionService: SessionService,
  allowedScopes: ReadonlyArray<string | null> = [SESSION_SCOPE_FULL],
  options: AuthenticatedSessionOptions = {},
): ResolveAuthenticatedSession {
  return async (req: IncomingMessage): Promise<ResolvedAccessToken | null> => {
    const auth = getHeader(req, "authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      if (token) {
        const resolved = await sessionService.resolveAccessToken(token);
        if (!resolved) {
          return null;
        }
        if (!sessionScopeAllowed(resolved.scope, allowedScopes)) {
          return null;
        }
        // Bootstrap tokens must be device-bound at mint time.
        if (
          resolved.scope === SESSION_SCOPE_REGISTRATION_RECOVERY &&
          (resolved.deviceId == null || resolved.deviceId === "")
        ) {
          return null;
        }
        if (
          !options.allowUnboundDevice &&
          isFullSessionScope(resolved.scope) &&
          !fullSessionIsBound(resolved)
        ) {
          return null;
        }
        return resolved;
      }
    }
    if (config.allowHeaderUserIdAuth) {
      const headerUser = getHeader(req, "x-user-id")?.trim();
      if (headerUser) {
        return {
          userId: headerUser,
          deviceId: null,
          scope: null,
          tokenHash: "",
          expiresAt: null,
        };
      }
    }
    return null;
  };
}

/**
 * Resolve Bearer (or optional X-User-Id) to a user id.
 * By default only full sessions are accepted. Pass `allowedScopes` to also accept
 * limited registration bootstrap tokens on specific routes.
 */
export function createResolveAuthenticatedUserId(
  config: Pick<ApiConfig, "allowHeaderUserIdAuth">,
  sessionService: SessionService,
  allowedScopes: ReadonlyArray<string | null> = [SESSION_SCOPE_FULL],
  options: AuthenticatedSessionOptions = {},
): ResolveAuthenticatedUserId {
  const resolveSession = createResolveAuthenticatedSession(
    config,
    sessionService,
    allowedScopes,
    options,
  );
  return async (req: IncomingMessage): Promise<string | null> => {
    const session = await resolveSession(req);
    return session?.userId ?? null;
  };
}

export function bearerTokenFromRequest(req: IncomingMessage): string | null {
  const auth = getHeader(req, "authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = auth.slice(7).trim();
  return token || null;
}

export { isFullSessionScope, SESSION_SCOPE_REGISTRATION_RECOVERY };
