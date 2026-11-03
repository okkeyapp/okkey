/**
 * Helpers for save-login prompt URLs (capture-time login form vs post-redirect).
 */

export type SaveOfferFormKind = "login" | "register" | "unknown";

/** Page URL where credentials were typed (`origin + pathname`). */
export function captureFormPageUrl(loc: Pick<Location, "origin" | "pathname">): string {
  return `${loc.origin}${loc.pathname}`;
}

/**
 * Website URL stored on the Login item.
 * - register → site home (`origin/`)
 * - login / unknown → capture form URL (not the post-login redirect)
 */
export function websiteUrlForSaveOffer(
  captureUrl: string,
  formType: SaveOfferFormKind | string,
): string {
  try {
    const parsed = new URL(captureUrl);
    if (formType === "register") {
      return `${parsed.origin}/`;
    }
    return `${parsed.origin}${parsed.pathname}` || `${parsed.origin}/`;
  } catch {
    return captureUrl;
  }
}

/** Normalize for equality / pending-tab comparisons. */
export function normalizeSaveUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "") || "";
    return `${parsed.origin}${path}` || parsed.origin;
  } catch {
    return url.replace(/\/$/, "");
  }
}

export function saveUrlsEqual(a: string, b: string): boolean {
  return normalizeSaveUrl(a) === normalizeSaveUrl(b);
}
