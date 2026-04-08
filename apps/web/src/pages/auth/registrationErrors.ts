import { ApiRequestError } from "@okkey/api";

import { isLikelyFetchNetworkError } from "./emailStartErrors";

/** Maps registration / post-registration API failures to i18n keys under `auth.registration.*`. */
export function registrationErrorI18nKey(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const code = err.body.error;
    switch (code) {
      case "AUTH_CHALLENGE_EXPIRED":
        return "auth.registration.errorSessionExpired";
      case "AUTH_CHALLENGE_INVALID":
        return "auth.registration.errorSessionInvalid";
      case "REGISTRATION_ALREADY_COMPLETED":
      case "REGISTRATION_CONFLICT":
        return "auth.registration.errorAlreadyRegistered";
      case "REGISTRATION_BAD_REQUEST":
        return "auth.registration.errorBadRequest";
      case "CRYPTO_PAYLOAD_INVALID":
        return "auth.registration.errorCryptoPayload";
      case "CRYPTO_PROFILE_NOT_ALLOWED":
        return "auth.registration.errorCryptoPolicy";
      case "CRYPTO_CAPABILITY_REQUIRED":
        return "auth.registration.errorCapabilityRequired";
      case "CRYPTO_ROLLOUT_PAUSED":
        return "auth.registration.errorRolloutPaused";
      case "INTERNAL_SERVER_ERROR":
        return "auth.registration.errorServer";
      default:
        if (err.status >= 500) {
          return "auth.registration.errorServer";
        }
        return "auth.registration.errorGeneric";
    }
  }
  if (isLikelyFetchNetworkError(err)) {
    return "auth.registration.errorNetwork";
  }
  if (err instanceof SyntaxError) {
    return "auth.registration.errorBadResponse";
  }
  return "auth.registration.errorGeneric";
}
