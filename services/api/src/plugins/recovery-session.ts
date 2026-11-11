import type { IncomingMessage } from "node:http";

import { bearerTokenFromRequest } from "../routes/auth-context.ts";
import { isFullSessionScope } from "../session/scopes.ts";

export type RecoverySessionMarkTarget = {
  userId: string;
  scope?: string | null;
  tokenHash?: string;
};

/**
 * Mark only the bearer session that `resolveSession` returns.
 * Expired and missing sessions are refused before the repository update.
 * The repository update itself still requires `expires_at > now()` and does
 * not move that timestamp, matching `SessionService.markRecoveryProved`.
 */
export async function markCallerSessionRecoveryProved(
  req: IncomingMessage,
  input: { method?: unknown },
  deps: {
    resolveSession: (req: IncomingMessage) => Promise<RecoverySessionMarkTarget | null>;
    markRecoveryProved: (accessToken: string, userId: string) => Promise<boolean>;
    onMarked?: (method: string) => void;
  },
): Promise<boolean> {
  const method = typeof input?.method === "string" ? input.method.trim() : "";
  if (!method) {
    return false;
  }
  const session = await deps.resolveSession(req);
  if (!session || !isFullSessionScope(session.scope) || !session.tokenHash) {
    return false;
  }
  const accessToken = bearerTokenFromRequest(req);
  if (!accessToken) {
    return false;
  }
  const marked = await deps.markRecoveryProved(accessToken, session.userId);
  if (!marked) {
    return false;
  }
  deps.onMarked?.(method);
  return true;
}
