/**
 * Helpers for vault / personal event list pages.
 *
 * The HTTP list endpoints return the full tail after `afterVersion` in one
 * response today (`hasMore: false`). Clients used to keep GETting until an
 * empty page, which always added one useless round-trip after every write.
 */

export type EventsListPageLike = {
  events: readonly unknown[];
  hasMore?: boolean;
};

/**
 * Whether another list request is needed after this page.
 * Prefer the server `hasMore` flag; legacy bodies without it are treated as a
 * complete tail (current API contract).
 */
export function eventsListHasMore(page: EventsListPageLike): boolean {
  if (!page.events.length) {
    return false;
  }
  if (typeof page.hasMore === "boolean") {
    return page.hasMore;
  }
  return false;
}

/** True when `events` are exactly `afterVersion+1 .. afterVersion+n` in order. */
export function areContiguousEventVersions(
  events: readonly { version: number }[],
  afterVersion: number,
): boolean {
  if (!events.length) {
    return false;
  }
  for (let i = 0; i < events.length; i += 1) {
    if (events[i]?.version !== afterVersion + 1 + i) {
      return false;
    }
  }
  return true;
}

export function latestVersionFromEventsPage(
  afterVersion: number,
  events: readonly { version: number }[],
  latestVersion?: number,
): number {
  if (typeof latestVersion === "number" && Number.isFinite(latestVersion)) {
    return latestVersion;
  }
  if (!events.length) {
    return afterVersion;
  }
  return events[events.length - 1]?.version ?? afterVersion;
}
