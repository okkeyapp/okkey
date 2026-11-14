/**
 * Core (okkey) update feed. An enterprise feed is a separate setting and is
 * not resolved here.
 *
 * An empty explicit value means "not configured" and uses the GitHub Releases
 * default. `OKKEY_UPDATE_ISOLATED` is applied by the caller and still skips
 * every check, including this default.
 */
export const CORE_UPDATE_GITHUB_REPOSITORY = "okkeyapp/okkey";

/** Stable URL of the newest core feed asset. GitHub redirects this to the release. */
export const DEFAULT_CORE_UPDATE_FEED_URL =
  `https://github.com/${CORE_UPDATE_GITHUB_REPOSITORY}/releases/latest/download/feed.json`;

/**
 * `OKKEY_UPDATE_CORE_FEED_URL` is the core feed. `OKKEY_UPDATE_FEED_URL` is the
 * previous name and still overrides the default when the core name is empty.
 */
export function resolveCoreUpdateFeedUrl(
  coreFeedUrl: string | undefined,
  legacyFeedUrl: string | undefined = undefined,
): string {
  const named = (coreFeedUrl ?? "").trim();
  if (named) {
    return named;
  }
  const legacy = (legacyFeedUrl ?? "").trim();
  if (legacy) {
    return legacy;
  }
  return DEFAULT_CORE_UPDATE_FEED_URL;
}
