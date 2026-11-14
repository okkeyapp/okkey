import { SystemUpdateError } from "./errors.ts";
import { fetchUpdateFeed, type FeedFetch } from "./feed.ts";
import type { UpdateFeedDocument } from "./package-format.ts";

/** Self-host update feeds are checked at most once per day. */
export const UPDATE_FEED_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  checkedAt: number;
  document: UpdateFeedDocument | null;
  error: SystemUpdateError | null;
};

/**
 * Remember one feed response per URL. Isolated mode and an empty URL never
 * read the cache and never call the network. A later enterprise feed uses
 * the same cache with its own URL key.
 */
export function createUpdateFeedCache(options?: { now?: () => number; ttlMs?: number }) {
  const ttlMs = options?.ttlMs ?? UPDATE_FEED_CHECK_INTERVAL_MS;
  const now = options?.now ?? (() => Date.now());
  const entries = new Map<string, CacheEntry>();

  return {
    async load(
      feedUrl: string,
      isolated: boolean,
      fetchImpl: FeedFetch,
      headers?: Record<string, string>,
    ): Promise<UpdateFeedDocument | null> {
      const url = feedUrl.trim();
      if (isolated || url === "") {
        return null;
      }
      const timestamp = now();
      const cached = entries.get(url);
      if (cached && timestamp - cached.checkedAt < ttlMs) {
        if (cached.error) {
          throw cached.error;
        }
        return cached.document;
      }
      try {
        const document = await fetchUpdateFeed(url, false, fetchImpl, headers);
        entries.set(url, { checkedAt: timestamp, document, error: null });
        return document;
      } catch (error) {
        const wrapped =
          error instanceof SystemUpdateError
            ? error
            : new SystemUpdateError(502, "FEED_FETCH_FAILED", "Update source could not be reached");
        if (wrapped.code !== "LICENSE_EXPIRED") {
          entries.set(url, { checkedAt: timestamp, document: null, error: wrapped });
        }
        throw wrapped;
      }
    },
  };
}
