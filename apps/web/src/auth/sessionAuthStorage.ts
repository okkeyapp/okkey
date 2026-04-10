import { SESSION_STORAGE_KEY } from "./storageKeys";

export interface StoredAccessSession {
  access_token: string;
  user_id: string;
  expires_at: string;
}

function localStorageOk(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function" &&
    typeof localStorage.removeItem === "function"
  );
}

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

function parseSession(raw: string | null): StoredAccessSession | null {
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
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

/**
 * Read session from localStorage; if missing, one-time migrate from sessionStorage (legacy).
 */
export function readStoredSession(): StoredAccessSession | null {
  if (localStorageOk()) {
    const fromLocal = parseSession(localStorage.getItem(SESSION_STORAGE_KEY));
    if (fromLocal) {
      return fromLocal;
    }
  }
  if (sessionStorageOk()) {
    const legacy = parseSession(sessionStorage.getItem(SESSION_STORAGE_KEY));
    if (legacy) {
      if (localStorageOk()) {
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(legacy));
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          return legacy;
        }
      }
      return legacy;
    }
  }
  return null;
}

export function writeStoredSession(session: StoredAccessSession): void {
  const raw = JSON.stringify(session);
  if (localStorageOk()) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, raw);
    } catch {
      /* ignore quota */
    }
    if (sessionStorageOk()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return;
  }
  if (sessionStorageOk()) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, raw);
    } catch {
      /* ignore quota */
    }
  }
}

export function clearStoredSession(): void {
  if (localStorageOk()) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
  if (sessionStorageOk()) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
