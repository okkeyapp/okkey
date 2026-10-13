import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { markPersonalDataBootstrapDismissed as markLocalPersonalDataBootstrapDismissed } from "../../items/personalDataBootstrapDismissal";
import {
  buildDefaultFavoriteOrder,
  encodeFavoriteOrderEntry,
  reconcileFavoriteOrder,
} from "./favoriteOrder";
import { DEFAULT_FAVORITE_CATEGORY_IDS } from "./itemCategoryCatalog";

export type ItemCategoryPreferencesContextValue = {
  favoriteIds: string[];
  favoriteTemplateIds: string[];
  favoriteOrder: string[];
  favoriteIdSet: Set<string>;
  favoriteTemplateIdSet: Set<string>;
  /** Server flag: skip personal_data bootstrap after the member deleted it. */
  personalDataBootstrapDismissed: boolean;
  ready: boolean;
  toggleFavorite: (categoryId: string) => void;
  toggleTemplateFavorite: (templateId: string) => void;
  reorderFavorites: (nextFavoriteOrder: string[]) => void;
  /** Persist dismiss on the server (and localStorage cache). */
  markPersonalDataBootstrapDismissed: () => void;
};

const ItemCategoryPreferencesContext = createContext<ItemCategoryPreferencesContextValue | null>(null);

export function useItemCategoryPreferencesState(
  workspaceId: string | null,
): ItemCategoryPreferencesContextValue {
  const core = useAuthenticatedCoreClient();
  const { userId } = useAuthVault();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([]);
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([]);
  const [personalDataBootstrapDismissed, setPersonalDataBootstrapDismissed] = useState(false);
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
      setPersonalDataBootstrapDismissed(false);
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
          const dismissed = Boolean(response.personal_data_bootstrap_dismissed);
          setPersonalDataBootstrapDismissed(dismissed);
          if (dismissed) {
            markLocalPersonalDataBootstrapDismissed(userId, workspaceId);
          }
        }
      } catch {
        if (!cancelled) {
          const categoryIds = [...DEFAULT_FAVORITE_CATEGORY_IDS];
          setFavoriteIds(categoryIds);
          setFavoriteTemplateIds([]);
          setFavoriteOrder(buildDefaultFavoriteOrder(categoryIds, []));
          setPersonalDataBootstrapDismissed(false);
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
  }, [core, userId, workspaceId]);

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
          setPersonalDataBootstrapDismissed(Boolean(response.personal_data_bootstrap_dismissed));
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

  const markPersonalDataBootstrapDismissed = useCallback(() => {
    setPersonalDataBootstrapDismissed(true);
    markLocalPersonalDataBootstrapDismissed(userId, workspaceId);
    if (!core || !workspaceId) {
      return;
    }
    void core
      .updateWorkspaceItemCategoryPreferences(workspaceId, {
        personal_data_bootstrap_dismissed: true,
      })
      .then((response) => {
        setPersonalDataBootstrapDismissed(Boolean(response.personal_data_bootstrap_dismissed));
      })
      .catch(() => {
        /* keep optimistic true; next GET will reconcile */
      });
  }, [core, userId, workspaceId]);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favoriteTemplateIdSet = useMemo(() => new Set(favoriteTemplateIds), [favoriteTemplateIds]);

  return {
    favoriteIds,
    favoriteTemplateIds,
    favoriteOrder,
    favoriteIdSet,
    favoriteTemplateIdSet,
    personalDataBootstrapDismissed,
    ready,
    toggleFavorite,
    toggleTemplateFavorite,
    reorderFavorites,
    markPersonalDataBootstrapDismissed,
  };
}

export function ItemCategoryPreferencesProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const value = useItemCategoryPreferencesState(workspaceId);
  return (
    <ItemCategoryPreferencesContext.Provider value={value}>{children}</ItemCategoryPreferencesContext.Provider>
  );
}

export function useItemCategoryPreferences(): ItemCategoryPreferencesContextValue {
  const ctx = useContext(ItemCategoryPreferencesContext);
  if (!ctx) {
    throw new Error("useItemCategoryPreferences must be used within ItemCategoryPreferencesProvider");
  }
  return ctx;
}
