import { PROFILE_STORAGE_KEY, profileScopedStorageKey } from "./storageKeys";

export interface LocalProfile {
  email: string;
  firstName?: string;
  lastName?: string;
}

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

function localStorageOk(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function" &&
    typeof localStorage.removeItem === "function"
  );
}

function parseProfile(raw: string | null): LocalProfile | null {
  if (!raw) {
    return null;
  }
  try {
    const o = JSON.parse(raw) as LocalProfile;
    if (!o.email?.trim()) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

function readSessionProfile(): LocalProfile | null {
  if (!sessionStorageOk()) {
    return null;
  }
  return parseProfile(sessionStorage.getItem(PROFILE_STORAGE_KEY));
}

function readScopedProfile(userId: string): LocalProfile | null {
  if (!localStorageOk()) {
    return null;
  }
  return parseProfile(localStorage.getItem(profileScopedStorageKey(userId)));
}

/**
 * @param userId — из сессии; `null` до логина (только session mirror с email).
 */
export function readLocalProfile(userId: string | null): LocalProfile | null {
  if (userId && localStorageOk()) {
    const scoped = readScopedProfile(userId);
    if (scoped) {
      return scoped;
    }
  }
  return readSessionProfile();
}

/**
 * Пишет зеркало в session (если есть email) и долговременную копию в localStorage для userId.
 */
export function writeLocalProfile(profile: LocalProfile, userId: string | null): void {
  if (profile.email?.trim() && sessionStorageOk()) {
    sessionStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }
  if (userId && profile.email?.trim() && localStorageOk()) {
    try {
      localStorage.setItem(profileScopedStorageKey(userId), JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }
}

/** Только session mirror — при logout, долговременный профиль пользователя сохраняем. */
export function clearSessionLocalProfile(): void {
  if (sessionStorageOk()) {
    sessionStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

/** @deprecated используйте clearSessionLocalProfile; оставлено для явной полной очистки при смене устройства */
export function clearLocalProfile(): void {
  clearSessionLocalProfile();
}

/**
 * После выдачи токена: объединяет email из OTP-шага (session) с именем из scoped-профиля.
 */
export function bridgeLocalProfileAfterLogin(userId: string): LocalProfile | null {
  const scoped = readScopedProfile(userId);
  const session = readSessionProfile();
  const email = scoped?.email?.trim() || session?.email?.trim() || "";
  if (!email) {
    return scoped ?? session;
  }
  const merged: LocalProfile = {
    email,
    firstName: scoped?.firstName ?? session?.firstName,
    lastName: scoped?.lastName ?? session?.lastName,
  };
  writeLocalProfile(merged, userId);
  return merged;
}
