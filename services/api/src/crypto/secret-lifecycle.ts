export function wipeSecretBytes(secret: Uint8Array | null | undefined): void {
  if (!secret) {
    return;
  }
  secret.fill(0);
}

export function withSecretBytes<T>(
  secret: Uint8Array,
  fn: (secret: Uint8Array) => T,
): T {
  try {
    return fn(secret);
  } finally {
    wipeSecretBytes(secret);
  }
}

export const SENSITIVE_QUERY_PARAM_NAMES = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "totp_code",
  "backup_code",
  "password",
  "master_password",
  "secret",
  "session_secret",
]);
