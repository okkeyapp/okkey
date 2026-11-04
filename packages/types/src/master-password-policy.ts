/**
 * Policy for a newly chosen master password (registration, change, recovery).
 *
 * Unlock, login, and sync do not use this minimum. Accounts that already have
 * a shorter password keep working.
 *
 * The server never receives the password. It can only check that a client
 * declared {@link MASTER_PASSWORD_POLICY_VERSION} when setting a new password.
 * That declaration is not a proof of length: a modified client can claim the
 * current version and still use a shorter password. Honest clients enforce
 * {@link MIN_MASTER_PASSWORD_LENGTH} before they declare the version.
 */

/** UTF-16 code units. Matches `string.length` on the password the user typed. */
export const MIN_MASTER_PASSWORD_LENGTH = 12;

/**
 * Declared by clients on registration and master-password change.
 * Version 1 means the client applied {@link MIN_MASTER_PASSWORD_LENGTH}.
 */
export const MASTER_PASSWORD_POLICY_VERSION = 1;

export function masterPasswordMeetsNewPasswordPolicy(password: string): boolean {
  return password.length >= MIN_MASTER_PASSWORD_LENGTH;
}

/**
 * Length of a UTF-8 master password, counted the same way as
 * {@link masterPasswordMeetsNewPasswordPolicy} (UTF-16 code units).
 * Throws if `bytes` are not valid UTF-8.
 */
export function masterPasswordUtf8Length(bytes: Uint8Array): number {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes).length;
}

export function masterPasswordUtf8MeetsNewPasswordPolicy(bytes: Uint8Array): boolean {
  return masterPasswordUtf8Length(bytes) >= MIN_MASTER_PASSWORD_LENGTH;
}

export function isCurrentMasterPasswordPolicyVersion(
  value: unknown,
): value is typeof MASTER_PASSWORD_POLICY_VERSION {
  return value === MASTER_PASSWORD_POLICY_VERSION;
}

/**
 * True only when this unlock typed a master password shorter than the current
 * minimum and the user has not dismissed the suggestion.
 * Callers pass the length, not the password. PIN and biometric unlocks must
 * not call this — those paths do not know the password length.
 */
export function shouldSuggestLongerMasterPassword(input: {
  passwordLength: number;
  dismissed: boolean;
}): boolean {
  return (
    input.dismissed !== true &&
    input.passwordLength > 0 &&
    input.passwordLength < MIN_MASTER_PASSWORD_LENGTH
  );
}

/**
 * localStorage key for a dismissed suggestion. The stored value is `"1"`.
 * The key does not include the password or its length.
 */
export function shortMasterPasswordHintDismissedStorageKey(userId: string): string {
  return `okkey.vault.shortMasterPasswordHint.dismissed.v1.u.${userId}`;
}

export function readShortMasterPasswordHintDismissed(
  storage: Pick<Storage, "getItem">,
  userId: string,
): boolean {
  try {
    return storage.getItem(shortMasterPasswordHintDismissedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeShortMasterPasswordHintDismissed(
  storage: Pick<Storage, "setItem">,
  userId: string,
): void {
  try {
    storage.setItem(shortMasterPasswordHintDismissedStorageKey(userId), "1");
  } catch {
    /* private mode or a full quota — the suggestion can show again next unlock */
  }
}
