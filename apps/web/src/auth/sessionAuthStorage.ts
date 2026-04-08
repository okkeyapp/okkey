import { SESSION_STORAGE_KEY } from "./storageKeys";

export interface StoredAccessSession {
  access_token: string;
  user_id: string;
  expires_at: string;
}

export function readStoredSession(): StoredAccessSession | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const o = JSON.parse(raw) as StoredAccessSession;
    if (!o.access_token?.trim() || !o.user_id?.trim()) {
      return null;
    }
    const exp = Date.parse(o.expires_at);
    if (!Number.isFinite(exp) || Date.now() >= exp) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredAccessSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
