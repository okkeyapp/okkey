/** Full Bearer session (default). Stored as SQL NULL. */
export const SESSION_SCOPE_FULL = null;

/**
 * Short-lived post-registration token: account recovery key enroll + export ack only.
 * Must not authorize vault unlock, devices, profile, or other APIs.
 */
export const SESSION_SCOPE_REGISTRATION_RECOVERY = "registration_recovery";

export type SessionScope = typeof SESSION_SCOPE_FULL | typeof SESSION_SCOPE_REGISTRATION_RECOVERY;

export function isFullSessionScope(scope: string | null | undefined): boolean {
  return scope == null || scope === "";
}

/** Routes that may accept a registration_recovery bootstrap token. */
export const REGISTRATION_RECOVERY_ALLOWED_SCOPES: ReadonlyArray<string | null> = [
  SESSION_SCOPE_FULL,
  SESSION_SCOPE_REGISTRATION_RECOVERY,
];

export function sessionScopeAllowed(
  scope: string | null | undefined,
  allowed: ReadonlyArray<string | null>,
): boolean {
  const normalized = isFullSessionScope(scope) ? null : scope!;
  return allowed.some((entry) => {
    if (entry == null || entry === "") {
      return normalized === null;
    }
    return normalized === entry;
  });
}
