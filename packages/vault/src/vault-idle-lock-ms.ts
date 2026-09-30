/** Matches server `users.vault_idle_lock_seconds` default (900 = 15 min). */
export const DEFAULT_VAULT_IDLE_LOCK_MS = 15 * 60 * 1000;

const MIN_SERVER_SECONDS = 60;
const MAX_SERVER_SECONDS = 24 * 60 * 60;

export function vaultIdleLockMsFromServerSeconds(seconds: number | undefined | null): number {
  if (seconds == null || !Number.isFinite(seconds)) {
    return DEFAULT_VAULT_IDLE_LOCK_MS;
  }
  const s = Math.trunc(seconds);
  if (s < MIN_SERVER_SECONDS || s > MAX_SERVER_SECONDS) {
    return DEFAULT_VAULT_IDLE_LOCK_MS;
  }
  return s * 1000;
}
