import { ApiRequestError } from "@okkey/api";

/** True when the API rejected the Bearer token (expired / revoked session). */
export function isUnauthorizedApiError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 401;
}
