/**
 * True when the page is the Okkey vault web app itself.
 * Autofill content-script overlays must not run there — they fight Radix
 * Select / datepicker UI inside item edit dialogs (month/year caption).
 */
export function isOkkeyWebAppOrigin(
  loc: Pick<Location, "hostname" | "port" | "protocol" | "origin"> = location,
): boolean {
  try {
    if (typeof document !== "undefined" && document.documentElement?.hasAttribute("data-okkey-web-app")) {
      return true;
    }
  } catch {
    /* ignore */
  }

  const host = (loc.hostname || "").toLowerCase();
  if (host === "okkey.app" || host.endsWith(".okkey.app")) {
    return true;
  }

  // Local Vite web (default apps/web) — extension must not overlay vault UI.
  if ((host === "localhost" || host === "127.0.0.1") && (loc.port === "5173" || loc.port === "3000")) {
    return true;
  }

  return false;
}
