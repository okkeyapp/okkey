import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { DEFAULT_FAVORITE_CATEGORY_IDS } from "./itemCategoryCatalog";

export function useItemCategoryPreferences(workspaceId: string | null) {
  const core = useAuthenticatedCoreClient();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const favoriteIdsRef = useRef(favoriteIds);

  useEffect(() => {
    favoriteIdsRef.current = favoriteIds;
  }, [favoriteIds]);

  useEffect(() => {
    if (!core || !workspaceId) {
      setFavoriteIds([]);
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const response = await core.getWorkspaceItemCategoryPreferences(workspaceId);
        if (!cancelled) {
          setFavoriteIds(response.favorite_category_ids);
        }
      } catch {
        if (!cancelled) {
          setFavoriteIds([...DEFAULT_FAVORITE_CATEGORY_IDS]);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [core, workspaceId]);

  const persistFavorites = useCallback(
    (nextFavoriteIds: string[]) => {
      const previousFavoriteIds = favoriteIdsRef.current;
      setFavoriteIds(nextFavoriteIds);
      if (!core || !workspaceId) {
        return;
      }
      void core
        .updateWorkspaceItemCategoryPreferences(workspaceId, {
          favorite_category_ids: nextFavoriteIds,
        })
        .then((response) => {
          setFavoriteIds(response.favorite_category_ids);
        })
        .catch(() => {
          setFavoriteIds(previousFavoriteIds);
        });
    },
    [core, workspaceId],
  );

  const toggleFavorite = useCallback(
    (categoryId: string) => {
      const current = favoriteIdsRef.current;
      persistFavorites(
        current.includes(categoryId)
          ? current.filter((id) => id !== categoryId)
          : [...current, categoryId],
      );
    },
    [persistFavorites],
  );

  const reorderFavorites = useCallback(
    (nextFavoriteIds: string[]) => {
      persistFavorites(nextFavoriteIds);
    },
    [persistFavorites],
  );

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  return {
    favoriteIds,
    favoriteIdSet,
    ready,
    toggleFavorite,
    reorderFavorites,
  };
}
