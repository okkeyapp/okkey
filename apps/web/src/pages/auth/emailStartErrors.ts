import { ApiRequestError } from "@okkey/api";

export function isLikelyFetchNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const m = err.message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror") ||
    m === "network request failed"
  );
}

/** Maps start-email-login failures to i18n key under `auth.email.*`. */
export function emailStartErrorI18nKey(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const code = err.body.error;
    switch (code) {
      case "AUTH_EMAIL_INVALID":
        return "auth.email.errorInvalidEmail";
      case "AUTH_RATE_LIMITED":
        return "auth.email.errorRateLimited";
      case "EMAIL_SEND_FAILED":
      case "EMAIL_TRANSPORT_ERROR":
      case "EMAIL_RENDER_FAILED":
      case "EMAIL_TEMPLATE_NOT_FOUND":
      case "EMAIL_TEMPLATE_MISSING_VARIABLE":
        return "auth.email.errorEmailSend";
      case "INTERNAL_SERVER_ERROR":
        return "auth.email.errorServer";
      default:
        if (err.status >= 500) {
          return "auth.email.errorServer";
        }
        return "auth.email.errorGeneric";
    }
  }
  if (isLikelyFetchNetworkError(err)) {
    return "auth.email.errorNetwork";
  }
  if (err instanceof SyntaxError) {
    return "auth.email.errorBadResponse";
  }
  return "auth.email.errorGeneric";
}
