/** Allow only same-origin absolute paths (no protocol-relative or external URLs). */
export function safeRedirectPath(redirect: string | null, fallback: string): string {
  if (!redirect || redirect.trim() === "") {
    return fallback;
  }
  const t = redirect.trim();
  if (t.includes("://") || t.startsWith("//")) {
    return fallback;
  }
  if (!t.startsWith("/")) {
    return fallback;
  }
  return t;
}
