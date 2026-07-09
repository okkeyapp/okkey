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
import type { WorkspaceItemTemplateDto } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";

import NewItemCategoryCard, { getCategoryLabel } from "./NewItemCategoryCard";
import NewItemTemplateCard from "./NewItemTemplateCard";
import { parseFavoriteOrderEntry } from "./favoriteOrder";
import {
  ITEM_CATEGORY_GROUPS,
  ITEM_CATEGORY_GROUP_AUTHORIZATION,
  categoriesForGroup,
  getItemCategoryDefinition,
  type ItemCategoryDefinition,
} from "./itemCategoryCatalog";
import { DoneIcon, ReorderIcon } from "./itemCategoryIcons";

type NewItemCategoryPickerProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  favoriteOrder: readonly string[];
  favoriteIdSet: ReadonlySet<string>;
  favoriteTemplateIdSet: ReadonlySet<string>;
  templates: readonly WorkspaceItemTemplateDto[];
  templatesReady: boolean;
  ready: boolean;
  onToggleFavorite: (categoryId: string) => void;
  onToggleTemplateFavorite: (templateId: string) => void;
  onReorderFavorites: (nextFavoriteOrder: string[]) => void;
  onSelectCategory: (categoryId: string) => void;
  onSelectTemplate: (template: WorkspaceItemTemplateDto) => void;
};

export default function NewItemCategoryPicker({
  t,
  favoriteOrder,
  favoriteIdSet,
  favoriteTemplateIdSet,
  templates,
  templatesReady,
  ready,
  onToggleFavorite,
  onToggleTemplateFavorite,
  onReorderFavorites,
  onSelectCategory,
  onSelectTemplate,
}: NewItemCategoryPickerProps) {
  const hasFavorites = favoriteOrder.length > 0;
  const canReorderFavorites = favoriteOrder.length >= 2;
  const [showAllCategoriesOverride, setShowAllCategoriesOverride] = useState<boolean | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const prevFavoriteCountRef = useRef(favoriteOrder.length);

  const showAllCategories = !hasFavorites || (showAllCategoriesOverride ?? false);

  useEffect(() => {
    const previousCount = prevFavoriteCountRef.current;
    const currentCount = favoriteOrder.length;

    if (previousCount === 0 && currentCount === 1) {
      setShowAllCategoriesOverride(true);
    } else if (currentCount === 0) {
      setShowAllCategoriesOverride(null);
    }

    prevFavoriteCountRef.current = currentCount;
  }, [favoriteOrder.length]);

  useEffect(() => {
    if (!canReorderFavorites) {
      setIsReorderMode(false);
      setActiveDragId(null);
    }
  }, [canReorderFavorites]);

  const showGroupedSections = ready && (!hasFavorites || showAllCategories);

  const templatesById = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);

  const activeDragEntry = activeDragId ? parseFavoriteOrderEntry(activeDragId) : null;
  const activeDragCategory =
    activeDragEntry?.type === "category"
      ? getItemCategoryDefinition(activeDragEntry.id)
      : undefined;
  const activeDragTemplate =
    activeDragEntry?.type === "template" ? templatesById.get(activeDragEntry.id) : undefined;

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = favoriteOrder.indexOf(String(active.id));
    const newIndex = favoriteOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onReorderFavorites(arrayMove([...favoriteOrder], oldIndex, newIndex));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
                {isReorderMode ? (
                  t("web.newItemPopup.doneReorder")
                ) : (
                  <>
                    <span className="md:hidden">{t("web.newItemPopup.reorderMobile")}</span>
                    <span className="hidden md:inline">{t("web.newItemPopup.reorder")}</span>
                  </>
                )}
              </Button>
            ) : null}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={favoriteOrder} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteOrder.map((orderEntry, index) => {
                  const parsed = parseFavoriteOrderEntry(orderEntry);
                  if (!parsed) {
                    return null;
                  }
                  if (parsed.type === "category") {
                    const category = getItemCategoryDefinition(parsed.id);
                    if (!category || !favoriteIdSet.has(parsed.id)) {
                      return null;
                    }
                    return (
                      <NewItemCategoryCard
                        key={orderEntry}
                        category={category}
                        label={getCategoryLabel(t, category)}
                        isFavorite
                        favoriteAriaLabel={t("web.newItemPopup.removeFavorite")}
                        size="featured"
                        isReorderMode={isReorderMode}
                        wiggleIndex={index}
                        sortable
                        sortableId={orderEntry}
                        onSelect={() => onSelectCategory(category.id)}
                        onToggleFavorite={() => onToggleFavorite(category.id)}
                      />
                    );
                  }
                  const template = templatesById.get(parsed.id);
                  if (!template || !favoriteTemplateIdSet.has(parsed.id)) {
                    return null;
                  }
                  return (
                    <NewItemTemplateCard
                      key={orderEntry}
                      templateId={template.id}
                      label={template.name}
                      categoryId={template.category_id}
                      faviconId={template.favicon_id}
                      faviconSource={template.payload.favicon_source}
                      isFavorite
                      size="featured"
                      isReorderMode={isReorderMode}
                      wiggleIndex={index}
                      sortable
                      sortableId={orderEntry}
                      favoriteAriaLabel={t("web.newItemPopup.removeFavorite")}
                      onSelect={() => onSelectTemplate(template)}
                      onToggleFavorite={() => onToggleTemplateFavorite(template.id)}
                    />
                  );
                })}
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
              {activeDragTemplate ? (
                <NewItemTemplateCard
                  templateId={activeDragTemplate.id}
                  label={activeDragTemplate.name}
                  categoryId={activeDragTemplate.category_id}
                  faviconId={activeDragTemplate.favicon_id}
                  faviconSource={activeDragTemplate.payload.favicon_source}
                  isFavorite
                  size="featured"
                  isDragging
                  favoriteAriaLabel={t("web.newItemPopup.removeFavorite")}
                  onSelect={() => undefined}
                  onToggleFavorite={() => undefined}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      ) : null}

      {showGroupedSections ? (
        <>
          {ITEM_CATEGORY_GROUPS.map((group) => (
            <div key={group.id} className="contents">
              {group.id === ITEM_CATEGORY_GROUP_AUTHORIZATION && templatesReady && templates.length > 0 ? (
                <TemplatesSection
                  t={t}
                  templates={templates}
                  favoriteTemplateIdSet={favoriteTemplateIdSet}
                  onSelectTemplate={onSelectTemplate}
                  onToggleTemplateFavorite={onToggleTemplateFavorite}
                />
              ) : null}
              <CategoryGroupSection
                title={t(group.labelKey)}
                categories={categoriesForGroup(group.id)}
                favoriteIdSet={favoriteIdSet}
                t={t}
                onSelectCategory={onSelectCategory}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          ))}
        </>
      ) : null}

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

function TemplatesSection({
  t,
  templates,
  favoriteTemplateIdSet,
  onSelectTemplate,
  onToggleTemplateFavorite,
}: {
  t: NewItemCategoryPickerProps["t"];
  templates: readonly WorkspaceItemTemplateDto[];
  favoriteTemplateIdSet: ReadonlySet<string>;
  onSelectTemplate: (template: WorkspaceItemTemplateDto) => void;
  onToggleTemplateFavorite: (templateId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-medium leading-5 text-card-foreground">
        {t("web.newItemPopup.templatesSection")}
      </h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {templates.map((template) => {
          const isFavorite = favoriteTemplateIdSet.has(template.id);
          return (
            <NewItemTemplateCard
              key={template.id}
              templateId={template.id}
              label={template.name}
              categoryId={template.category_id}
              faviconId={template.favicon_id}
              faviconSource={template.payload.favicon_source}
              isFavorite={isFavorite}
              favoriteAriaLabel={
                isFavorite ? t("web.newItemPopup.removeFavorite") : t("web.newItemPopup.addFavorite")
              }
              onSelect={() => onSelectTemplate(template)}
              onToggleFavorite={() => onToggleTemplateFavorite(template.id)}
            />
          );
        })}
      </div>
    </section>
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
