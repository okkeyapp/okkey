/**
 * True when the API rejected the Bearer token (expired / revoked session).
 *
 * Duck-typed so extension unit tests (node:test without built `@okkey/api` dist)
 * can load device-trust helpers the same way as other `src/lib/*.test.ts` files.
 * Matches `ApiRequestError` from `@okkey/api` (`name` + `status`).
 */
export function isUnauthorizedApiError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const candidate = err as { name?: unknown; status?: unknown };
  return candidate.name === "ApiRequestError" && candidate.status === 401;
}
