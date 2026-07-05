import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import {
  buildDefaultFavoriteOrder,
  encodeFavoriteOrderEntry,
  reconcileFavoriteOrder,
} from "./favoriteOrder";
import { DEFAULT_FAVORITE_CATEGORY_IDS } from "./itemCategoryCatalog";

export function useItemCategoryPreferences(workspaceId: string | null) {
  const core = useAuthenticatedCoreClient();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const favoriteIdsRef = useRef(favoriteIds);
  const favoriteTemplateIdsRef = useRef(favoriteTemplateIds);
  const favoriteOrderRef = useRef(favoriteOrder);

  useEffect(() => {
    favoriteIdsRef.current = favoriteIds;
  }, [favoriteIds]);

  useEffect(() => {
    favoriteTemplateIdsRef.current = favoriteTemplateIds;
  }, [favoriteTemplateIds]);

  useEffect(() => {
    favoriteOrderRef.current = favoriteOrder;
  }, [favoriteOrder]);

  useEffect(() => {
    if (!core || !workspaceId) {
      setFavoriteIds([]);
      setFavoriteTemplateIds([]);
      setFavoriteOrder([]);
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const response = await core.getWorkspaceItemCategoryPreferences(workspaceId);
        if (!cancelled) {
          const categoryIds = response.favorite_category_ids;
          const templateIds = response.favorite_template_ids ?? [];
          const order =
            response.favorite_order?.length > 0
              ? response.favorite_order
              : buildDefaultFavoriteOrder(categoryIds, templateIds);
          setFavoriteIds(categoryIds);
          setFavoriteTemplateIds(templateIds);
          setFavoriteOrder(reconcileFavoriteOrder(order, categoryIds, templateIds));
        }
      } catch {
        if (!cancelled) {
          const categoryIds = [...DEFAULT_FAVORITE_CATEGORY_IDS];
          setFavoriteIds(categoryIds);
          setFavoriteTemplateIds([]);
          setFavoriteOrder(buildDefaultFavoriteOrder(categoryIds, []));
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

  const persistPreferences = useCallback(
    (nextFavoriteIds: string[], nextFavoriteTemplateIds: string[], nextFavoriteOrder: string[]) => {
      const previousFavoriteIds = favoriteIdsRef.current;
      const previousFavoriteTemplateIds = favoriteTemplateIdsRef.current;
      const previousFavoriteOrder = favoriteOrderRef.current;
      const reconciledOrder = reconcileFavoriteOrder(
        nextFavoriteOrder,
        nextFavoriteIds,
        nextFavoriteTemplateIds,
      );
      setFavoriteIds(nextFavoriteIds);
      setFavoriteTemplateIds(nextFavoriteTemplateIds);
      setFavoriteOrder(reconciledOrder);
      if (!core || !workspaceId) {
        return;
      }
      void core
        .updateWorkspaceItemCategoryPreferences(workspaceId, {
          favorite_category_ids: nextFavoriteIds,
          favorite_template_ids: nextFavoriteTemplateIds,
          favorite_order: reconciledOrder,
        })
        .then((response) => {
          const categoryIds = response.favorite_category_ids;
          const templateIds = response.favorite_template_ids ?? [];
          const order =
            response.favorite_order?.length > 0
              ? response.favorite_order
              : buildDefaultFavoriteOrder(categoryIds, templateIds);
          setFavoriteIds(categoryIds);
          setFavoriteTemplateIds(templateIds);
          setFavoriteOrder(reconcileFavoriteOrder(order, categoryIds, templateIds));
        })
        .catch(() => {
          setFavoriteIds(previousFavoriteIds);
          setFavoriteTemplateIds(previousFavoriteTemplateIds);
          setFavoriteOrder(previousFavoriteOrder);
        });
    },
    [core, workspaceId],
  );

  const toggleFavorite = useCallback(
    (categoryId: string) => {
      const current = favoriteIdsRef.current;
      const orderEntry = encodeFavoriteOrderEntry("category", categoryId);
      const isFavorite = current.includes(categoryId);
      const nextFavoriteIds = isFavorite
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      const nextFavoriteOrder = isFavorite
        ? favoriteOrderRef.current.filter((entry) => entry !== orderEntry)
        : [...favoriteOrderRef.current, orderEntry];
      persistPreferences(nextFavoriteIds, favoriteTemplateIdsRef.current, nextFavoriteOrder);
    },
    [persistPreferences],
  );

  const reorderFavorites = useCallback(
    (nextFavoriteOrder: string[]) => {
      persistPreferences(favoriteIdsRef.current, favoriteTemplateIdsRef.current, nextFavoriteOrder);
    },
    [persistPreferences],
  );

  const toggleTemplateFavorite = useCallback(
    (templateId: string) => {
      const current = favoriteTemplateIdsRef.current;
      const orderEntry = encodeFavoriteOrderEntry("template", templateId);
      const isFavorite = current.includes(templateId);
      const nextFavoriteTemplateIds = isFavorite
        ? current.filter((id) => id !== templateId)
        : [...current, templateId];
      const nextFavoriteOrder = isFavorite
        ? favoriteOrderRef.current.filter((entry) => entry !== orderEntry)
        : [...favoriteOrderRef.current, orderEntry];
      persistPreferences(favoriteIdsRef.current, nextFavoriteTemplateIds, nextFavoriteOrder);
    },
    [persistPreferences],
  );

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteTemplateIdSet = useMemo(() => new Set(favoriteTemplateIds), [favoriteTemplateIds]);

  return {
    favoriteIds,
    favoriteTemplateIds,
    favoriteOrder,
    favoriteIdSet,
    favoriteTemplateIdSet,
    ready,
    toggleFavorite,
    toggleTemplateFavorite,
    reorderFavorites,
  };
}
