/**
 * True when the page is the Okkey vault web app itself.
 * Autofill content-script overlays must not run there — they fight Radix
 * Select / datepicker UI inside item edit dialogs (month/year caption).
 */

export type OkkeyWebAppLocation = Pick<Location, "hostname" | "port" | "protocol" | "origin">;

export type IsOkkeyWebAppOriginOptions = {
  /**
   * Extension profile / lastServer web base URLs.
   * Compared by origin so self-host Docker (`http://localhost:8080`) matches
   * even when `<html data-okkey-web-app>` is missing from an older image.
   */
  configuredWebBaseUrls?: readonly string[];
};

/** Origins from the active extension profile / last server preference. */
let configuredWebBaseOrigins = new Set<string>();

/** Parse a configured web base URL to a canonical origin, or null if invalid. */
export function originFromWebBaseUrl(webBaseUrl: string): string | null {
  const trimmed = webBaseUrl.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const withScheme = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

function originsFromWebBaseUrls(webBaseUrls: readonly string[]): Set<string> {
  const next = new Set<string>();
  for (const raw of webBaseUrls) {
    const origin = originFromWebBaseUrl(raw);
    if (origin) {
      next.add(origin);
    }
  }
  return next;
}

/**
 * Cache configured web bases so sync `isOkkeyWebAppOrigin()` call sites
 * (focus/paint) can treat the connected self-host web app as Okkey vault UI.
 */
export function setConfiguredOkkeyWebBaseUrls(webBaseUrls: readonly string[]): void {
  configuredWebBaseOrigins = originsFromWebBaseUrls(webBaseUrls);
}

export function isOkkeyWebAppOrigin(
  loc: OkkeyWebAppLocation = location,
  options?: IsOkkeyWebAppOriginOptions,
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
  // Also match IPv6 loopback and missing port in edge cases via origin parse.
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    if (loc.port === "5173" || loc.port === "3000") {
      return true;
    }
    try {
      const originPort = new URL(loc.origin).port;
      if (originPort === "5173" || originPort === "3000") {
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  const configured = options?.configuredWebBaseUrls
    ? originsFromWebBaseUrls(options.configuredWebBaseUrls)
    : configuredWebBaseOrigins;

  if (configured.size > 0) {
    try {
      const pageOrigin = new URL(loc.origin).origin;
      if (configured.has(pageOrigin)) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}
