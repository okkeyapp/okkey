import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  getSettingsPopupCacheState,
  refreshSettingsPopupCacheSlice,
  setSettingsPopupCacheData,
  settingsPopupSliceNeedsSkeleton,
  subscribeSettingsPopupCache,
  type SettingsPopupCacheKey,
  type SettingsPopupCacheState,
  type SettingsPopupSlice,
} from "./settingsPopupCache";

function useSettingsPopupSlice<K extends SettingsPopupCacheKey>(
  key: K,
): SettingsPopupSlice<SettingsPopupCacheState[K]["data"]> {
  return useSyncExternalStore(
    subscribeSettingsPopupCache,
    () => getSettingsPopupCacheState()[key],
    () => getSettingsPopupCacheState()[key],
  );
}

export function useSettingsPopupCacheEntry<K extends SettingsPopupCacheKey>(
  key: K,
  ensureFetch: () => Promise<SettingsPopupCacheState[K]["data"]>,
  mapError?: (err: unknown) => string,
): {
  data: SettingsPopupCacheState[K]["data"];
  error: string | null;
  needsSkeleton: boolean;
  setData: (data: SettingsPopupCacheState[K]["data"]) => void;
  refresh: (opts?: { quiet?: boolean }) => Promise<SettingsPopupCacheState[K]["data"]>;
} {
  const slice = useSettingsPopupSlice(key);

  const refresh = useCallback(
    (opts?: { quiet?: boolean }) =>
      refreshSettingsPopupCacheSlice(key, async () => {
        const next = await ensureFetch();
        if (next == null) {
          throw new Error("settings cache fetch returned empty");
        }
        return next as NonNullable<SettingsPopupCacheState[K]["data"]>;
      }, { quiet: opts?.quiet, mapError }),
    [ensureFetch, key, mapError],
  );

  useEffect(() => {
    if (slice.status === "idle" && slice.inflight == null) {
      void refresh();
    }
  }, [refresh, slice.inflight, slice.status]);

  const setData = useCallback(
    (data: SettingsPopupCacheState[K]["data"]) => {
      setSettingsPopupCacheData(key, data);
    },
    [key],
  );

  return {
    data: slice.data,
    error: slice.error,
    needsSkeleton: settingsPopupSliceNeedsSkeleton(slice),
    setData,
    refresh,
  };
}
