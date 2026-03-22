import type { IncomingMessage } from "node:http";
import type { ApiConfig } from "../config.ts";
import type { SessionService } from "../session/service.ts";
import { getHeader } from "../http.ts";

export function createResolveAuthenticatedUserId(
  config: Pick<ApiConfig, "allowHeaderUserIdAuth">,
  sessionService: SessionService,
): (req: IncomingMessage) => Promise<string | null> {
  return async (req: IncomingMessage): Promise<string | null> => {
    const auth = getHeader(req, "authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      if (token) {
        const resolved = await sessionService.resolveAccessToken(token);
        if (resolved) {
          return resolved.userId;
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
