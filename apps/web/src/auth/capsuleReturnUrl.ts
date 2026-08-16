const KEY = "okkey:capsule-return-url";

export function storeCapsuleReturnUrl(value: string): void {
  if (value.startsWith("/capsule/") && !value.includes("://")) {
    sessionStorage.setItem(KEY, value);
  }
}

export function consumeCapsuleReturnUrl(): string | null {
  const value = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return value?.startsWith("/capsule/") && !value.includes("://") ? value : null;
}
