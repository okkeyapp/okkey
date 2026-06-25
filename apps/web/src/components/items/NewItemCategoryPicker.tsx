import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import NewItemCategoryCard, { getCategoryLabel } from "./NewItemCategoryCard";
import {
  ITEM_CATEGORY_GROUPS,
  categoriesForGroup,
  sortCategoriesByFavoriteOrder,
  type ItemCategoryDefinition,
} from "./itemCategoryCatalog";
import { DoneIcon, ReorderIcon } from "./itemCategoryIcons";

type NewItemCategoryPickerProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  favoriteIds: readonly string[];
  favoriteIdSet: ReadonlySet<string>;
  ready: boolean;
  onToggleFavorite: (categoryId: string) => void;
  onReorderFavorites: (nextFavoriteIds: string[]) => void;
  onSelectCategory: (categoryId: string) => void;
};

export default function NewItemCategoryPicker({
  t,
  favoriteIds,
  favoriteIdSet,
  ready,
  onToggleFavorite,
  onReorderFavorites,
  onSelectCategory,
}: NewItemCategoryPickerProps) {
  const hasFavorites = favoriteIds.length > 0;
  const canReorderFavorites = favoriteIds.length >= 2;
  const [showAllCategoriesOverride, setShowAllCategoriesOverride] = useState<boolean | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const prevFavoriteCountRef = useRef(favoriteIds.length);

  const showAllCategories = !hasFavorites || (showAllCategoriesOverride ?? false);

  useEffect(() => {
    const previousCount = prevFavoriteCountRef.current;
    const currentCount = favoriteIds.length;

    if (previousCount === 0 && currentCount === 1) {
      setShowAllCategoriesOverride(true);
    } else if (currentCount === 0) {
      setShowAllCategoriesOverride(null);
    }

    prevFavoriteCountRef.current = currentCount;
  }, [favoriteIds.length]);

  useEffect(() => {
    if (!canReorderFavorites) {
      setIsReorderMode(false);
      setActiveDragId(null);
    }
  }, [canReorderFavorites]);

  const showGroupedSections = ready && (!hasFavorites || showAllCategories);
  const favoriteCategories = useMemo(
    () => sortCategoriesByFavoriteOrder(favoriteIds, favoriteIds),
    [favoriteIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDragCategory = activeDragId
    ? favoriteCategories.find((category) => category.id === activeDragId)
    : undefined;

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = favoriteIds.indexOf(String(active.id));
    const newIndex = favoriteIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onReorderFavorites(arrayMove([...favoriteIds], oldIndex, newIndex));
  }

  function toggleReorderMode() {
    setIsReorderMode((current) => !current);
    setActiveDragId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {hasFavorites ? (
        <section className="flex flex-col gap-2">
          <div className="flex h-9 items-center gap-2.5">
            <h3 className="min-w-0 flex-1 text-sm font-medium leading-5 text-card-foreground">
              {t("web.newItemPopup.favoritesSection")}
            </h3>
            {canReorderFavorites ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 shrink-0 gap-2 px-3 text-sm font-medium"
                aria-pressed={isReorderMode}
                onClick={toggleReorderMode}
              >
                {isReorderMode ? (
                  <DoneIcon className="size-4 shrink-0 text-foreground" />
                ) : (
                  <ReorderIcon className="size-4 shrink-0 text-foreground" />
                )}
                {isReorderMode ? t("web.newItemPopup.doneReorder") : t("web.newItemPopup.reorder")}
              </Button>
            ) : null}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={favoriteIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteCategories.map((category, index) => (
                  <NewItemCategoryCard
                    key={category.id}
                    category={category}
                    label={getCategoryLabel(t, category)}
                    isFavorite
                    favoriteAriaLabel={t("web.newItemPopup.removeFavorite")}
                    size="featured"
                    isReorderMode={isReorderMode}
                    wiggleIndex={index}
                    sortable
                    onSelect={() => onSelectCategory(category.id)}
                    onToggleFavorite={() => onToggleFavorite(category.id)}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeDragCategory ? (
                <NewItemCategoryCard
                  category={activeDragCategory}
                  label={getCategoryLabel(t, activeDragCategory)}
                  isFavorite
                  favoriteAriaLabel={t("web.newItemPopup.removeFavorite")}
                  size="featured"
                  isDragging
                  onSelect={() => undefined}
                  onToggleFavorite={() => undefined}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      ) : null}

      {showGroupedSections
        ? ITEM_CATEGORY_GROUPS.map((group) => (
            <CategoryGroupSection
              key={group.id}
              title={t(group.labelKey)}
              categories={categoriesForGroup(group.id)}
              favoriteIdSet={favoriteIdSet}
              t={t}
              onSelectCategory={onSelectCategory}
              onToggleFavorite={onToggleFavorite}
            />
          ))
        : null}

      {hasFavorites ? (
        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full rounded-lg text-sm font-medium"
          onClick={() => {
            setShowAllCategoriesOverride((current) => {
              const showingAll = !hasFavorites || (current ?? false);
              return showingAll ? false : true;
            });
            setIsReorderMode(false);
          }}
        >
          {showAllCategories
            ? t("web.newItemPopup.showFavoritesOnly")
            : t("web.newItemPopup.showAllCategories")}
        </Button>
      ) : null}
    </div>
  );
}

function CategoryGroupSection({
  title,
  categories,
  favoriteIdSet,
  t,
  onSelectCategory,
  onToggleFavorite,
}: {
  title: string;
  categories: ItemCategoryDefinition[];
  favoriteIdSet: ReadonlySet<string>;
  t: NewItemCategoryPickerProps["t"];
  onSelectCategory: (categoryId: string) => void;
  onToggleFavorite: (categoryId: string) => void;
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-medium leading-5 text-card-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {categories.map((category) => {
          const isFavorite = favoriteIdSet.has(category.id);
          return (
            <NewItemCategoryCard
              key={category.id}
              category={category}
              label={getCategoryLabel(t, category)}
              isFavorite={isFavorite}
              favoriteAriaLabel={
                isFavorite ? t("web.newItemPopup.removeFavorite") : t("web.newItemPopup.addFavorite")
              }
              size="compact"
              onSelect={() => onSelectCategory(category.id)}
              onToggleFavorite={() => onToggleFavorite(category.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
