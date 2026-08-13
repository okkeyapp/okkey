const PENDING_INVITE_TOKEN_KEY = "okkey.pendingInviteToken";

export function writePendingInviteToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) {
    return;
  }
  sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, trimmed);
}

export function readPendingInviteToken(): string | null {
  const raw = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function clearPendingInviteToken(): void {
  sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
}
