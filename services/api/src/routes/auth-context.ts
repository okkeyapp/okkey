import type { IncomingMessage } from "node:http";
import type { ApiConfig } from "../config.ts";
import type { SessionService } from "../session/service.ts";
import {
  isFullSessionScope,
  sessionScopeAllowed,
  SESSION_SCOPE_FULL,
} from "../session/scopes.ts";
import { getHeader } from "../http.ts";

export type ResolveAuthenticatedUserId = (req: IncomingMessage) => Promise<string | null>;

/**
 * Resolve Bearer (or optional X-User-Id) to a user id.
 * By default only full sessions are accepted. Pass `allowedScopes` to also accept
 * limited registration bootstrap tokens on specific routes.
 */
export function createResolveAuthenticatedUserId(
  config: Pick<ApiConfig, "allowHeaderUserIdAuth">,
  sessionService: SessionService,
  allowedScopes: ReadonlyArray<string | null> = [SESSION_SCOPE_FULL],
): ResolveAuthenticatedUserId {
  return async (req: IncomingMessage): Promise<string | null> => {
    const auth = getHeader(req, "authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      if (token) {
        const resolved = await sessionService.resolveAccessToken(token);
        if (resolved && sessionScopeAllowed(resolved.scope, allowedScopes)) {
          return resolved.userId;
        }
        // Scoped token presented on a route that does not allow it → unauthenticated.
        if (resolved && !isFullSessionScope(resolved.scope)) {
          return null;
        }
      }
    }
    if (config.allowHeaderUserIdAuth) {
      const headerUser = getHeader(req, "x-user-id")?.trim();
      if (headerUser) {
        return headerUser;
      }
    }
    return null;
  };
}
