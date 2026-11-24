import { ApiRequestError } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";

export type InvitePreviewError =
  | { key: "web.invite.invalid" }
  | { key: "web.invite.errorRateLimited"; values: WebMessageValues }
  | { key: "web.invite.errorGeneric" };

/** Map invite preview fetch failures to i18n keys (and optional values). */
export function invitePreviewErrorFromUnknown(error: unknown): InvitePreviewError {
  if (!(error instanceof ApiRequestError)) {
    return { key: "web.invite.errorGeneric" };
  }
  if (error.status === 404) {
    return { key: "web.invite.invalid" };
  }
  if (error.status === 429 || error.body.error === "AUTH_RATE_LIMITED") {
    const retry = error.body.details?.retryAfterSeconds;
    const seconds = typeof retry === "number" && Number.isFinite(retry) ? retry : 600;
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return { key: "web.invite.errorRateLimited", values: { minutes } };
  }
  return { key: "web.invite.errorGeneric" };
}
