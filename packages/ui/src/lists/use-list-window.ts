import { useCallback, useEffect, useState } from "react";

import { LIST_PAGE_SIZE } from "./list-page-size.js";

export type UseListWindowOptions = {
  /** Total rows in the current filter/sort/search result. */
  total: number;
  /** Rows revealed per page / scroll step. Defaults to {@link LIST_PAGE_SIZE}. */
  pageSize?: number;
  /**
   * When this key changes (scope / filter / sort / search), the window resets to one page.
   * Do not include deep-link active ids — list must not auto-expand for them.
   */
  resetKey: string;
};

export type UseListWindowResult = {
  visibleCount: number;
  hasMore: boolean;
  loadMore: () => void;
};

/**
 * Client-side infinite-scroll window: show `pageSize` rows, then +`pageSize` on demand.
 * Sync/data refreshes that only change `total` do not reset the window (only `resetKey` does).
 */
export function useListWindow({
  total,
  pageSize = LIST_PAGE_SIZE,
  resetKey,
}: UseListWindowOptions): UseListWindowResult {
  const safePageSize = Math.max(1, pageSize);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(safePageSize, Math.max(0, total)),
  );

  useEffect(() => {
    setVisibleCount(Math.min(safePageSize, Math.max(0, total)));
    // Intentionally omit `total`: filter/scope resets only via resetKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey + pageSize only
  }, [resetKey, safePageSize]);

  useEffect(() => {
    setVisibleCount((current) => {
      if (total <= 0) {
        return 0;
      }
      if (current === 0) {
        return Math.min(safePageSize, total);
      }
      if (current > total) {
        return total;
      }
      return current;
    });
  }, [total, safePageSize]);

  const loadMore = useCallback(() => {
    setVisibleCount((current) => {
      if (current >= total) {
        return current;
      }
      return Math.min(total, current + safePageSize);
    });
  }, [safePageSize, total]);

  return {
    visibleCount,
    hasMore: visibleCount < total,
    loadMore,
  };
}
