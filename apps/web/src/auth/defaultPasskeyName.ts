import { parseBrowserEnvironment } from "./browserEnvironment";

/**
 * Default WebAuthn credential label for a newly registered passkey.
 * Prefer "Chrome on macOS"; fall back to the browser name alone.
 */
export function defaultPasskeyName(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const env = parseBrowserEnvironment(userAgent);
  const os =
    env.osName && env.osName !== "unknown"
      ? env.osName
      : env.hardwareLabel && env.hardwareLabel !== "unknown"
        ? env.hardwareLabel
        : "";
  const browser = env.clientLabel.trim() || "Passkey";
  if (!os) {
    return browser;
  }
  return `${browser} on ${os}`;
}
