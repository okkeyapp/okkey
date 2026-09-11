import type { PrimaryLoginMethod } from "@okkey/types";

const LAST_LOGIN_KEY = "okkey.auth.lastLoginMethod";
const PENDING_DISCOVER_KEY = "okkey.auth.pendingLoginDiscover";

export type LastLoginMethodHint = {
  email: string;
  primary: PrimaryLoginMethod;
};

export type PendingLoginDiscover = {
  email: string;
  primary: PrimaryLoginMethod;
  methods: PrimaryLoginMethod[];
};

function isPrimary(value: unknown): value is PrimaryLoginMethod {
  return value === "email" || value === "passkey" || value === "hardware_key";
}

export function readLastLoginMethodHint(): LastLoginMethodHint | null {
  try {
    const raw = localStorage.getItem(LAST_LOGIN_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { email?: unknown; primary?: unknown };
    if (typeof parsed.email !== "string" || !parsed.email.trim() || !isPrimary(parsed.primary)) {
      return null;
    }
    return { email: parsed.email.trim(), primary: parsed.primary };
  } catch {
    return null;
  }
}

export function writeLastLoginMethodHint(hint: LastLoginMethodHint): void {
  try {
    localStorage.setItem(
      LAST_LOGIN_KEY,
      JSON.stringify({ email: hint.email.trim().toLowerCase(), primary: hint.primary }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function writePendingLoginDiscover(payload: PendingLoginDiscover): void {
  try {
    sessionStorage.setItem(PENDING_DISCOVER_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readPendingLoginDiscover(): PendingLoginDiscover | null {
  try {
    const raw = sessionStorage.getItem(PENDING_DISCOVER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      email?: unknown;
      primary?: unknown;
      methods?: unknown;
    };
    if (typeof parsed.email !== "string" || !parsed.email.trim() || !isPrimary(parsed.primary)) {
      return null;
    }
    const methods = Array.isArray(parsed.methods)
      ? parsed.methods.filter(isPrimary)
      : (["email"] as PrimaryLoginMethod[]);
    if (!methods.includes("email")) {
      methods.unshift("email");
    }
    return {
      email: parsed.email.trim(),
      primary: parsed.primary,
      methods,
    };
  } catch {
    return null;
  }
}

export function clearPendingLoginDiscover(): void {
  try {
    sessionStorage.removeItem(PENDING_DISCOVER_KEY);
  } catch {
    // ignore
  }
}
