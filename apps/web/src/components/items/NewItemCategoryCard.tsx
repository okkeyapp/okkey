import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";

import type { ItemCategoryDefinition } from "./itemCategoryCatalog";
import { ItemCategoryIcon, StarIcon } from "./itemCategoryIcons";

export type NewItemCategoryCardProps = {
  category: ItemCategoryDefinition;
  label: string;
  isFavorite: boolean;
  favoriteAriaLabel: string;
  size: "featured" | "compact";
  isReorderMode?: boolean;
  isDragging?: boolean;
  isDropPlaceholder?: boolean;
  sortable?: boolean;
  wiggleIndex?: number;
  onSelect: () => void;
  onToggleFavorite: () => void;
};

function categoryWiggleStyle(wiggleIndex: number): CSSProperties {
  return {
    animationDelay: `${(wiggleIndex % 5) * 0.13}s`,
    animationDuration: `${0.32 + (wiggleIndex % 4) * 0.06}s`,
  };
}

const categoryCardInteractiveClassName =
  "outline-none hover:border-primary focus-visible:border-accent focus-visible:bg-background focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] active:border-accent active:bg-background active:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";

export default function NewItemCategoryCard({
  category,
  label,
  isFavorite,
  favoriteAriaLabel,
  size,
  isReorderMode = false,
  isDragging = false,
  isDropPlaceholder = false,
  sortable = false,
  wiggleIndex = 0,
  onSelect,
  onToggleFavorite,
}: NewItemCategoryCardProps) {
  if (isDropPlaceholder) {
    return (
      <div
        className="min-h-[72px] rounded-lg border border-dashed border-primary/35 bg-muted/20"
        aria-hidden
      />
    );
  }

  const iconPixelSize = size === "featured" ? 24 : 16;
  const iconBoxClassName =
    size === "featured" ? "size-10 rounded-lg" : "size-6 rounded";

  const card = (
    <div
      className={cn(
        "relative flex items-center gap-4 rounded-lg border border-border bg-background p-4 text-left transition-[border-color,box-shadow,background-color]",
        isDragging && "shadow-md",
        isReorderMode ? "cursor-grab active:cursor-grabbing" : cn("cursor-pointer", categoryCardInteractiveClassName),
      )}
      onClick={() => {
        if (isReorderMode) {
          return;
        }
        onSelect();
      }}
      onKeyDown={(event) => {
        if (isReorderMode || event.currentTarget !== event.target) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role={isReorderMode ? undefined : "button"}
      tabIndex={isReorderMode ? -1 : 0}
    >
      <div
        className={cn("flex shrink-0 items-center justify-center text-white", iconBoxClassName)}
        style={{ backgroundColor: category.iconColor }}
        aria-hidden
      >
        <ItemCategoryIcon categoryId={category.id} pixelSize={iconPixelSize} className="shrink-0 text-white" />
      </div>
      <div className="min-w-0 flex-1 pe-6">
        <p className="text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">{label}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        className="absolute top-1 right-1 text-foreground"
        aria-label={favoriteAriaLabel}
        aria-pressed={isFavorite}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <StarIcon filled={isFavorite} className="size-4 shrink-0" />
      </Button>
    </div>
  );

  const wiggleWrapperClassName = cn(
    isReorderMode && !isDragging && "animate-category-wiggle",
  );
  const wiggleWrapperStyle = isReorderMode && !isDragging ? categoryWiggleStyle(wiggleIndex) : undefined;

  if (!sortable) {
    return (
      <div className={wiggleWrapperClassName} style={wiggleWrapperStyle}>
        {card}
      </div>
    );
  }

  return (
    <SortableNewItemCategoryCard
      {...{
        category,
        label,
        isFavorite,
        favoriteAriaLabel,
        size,
        isReorderMode,
        wiggleIndex,
        onSelect,
        onToggleFavorite,
      }}
    />
  );
}

function SortableNewItemCategoryCard(
  props: Omit<NewItemCategoryCardProps, "sortable" | "isDragging" | "isDropPlaceholder">,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.category.id,
    disabled: !props.isReorderMode,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 0 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none" {...attributes} {...listeners}>
      {isDragging ? (
        <NewItemCategoryCard {...props} isDropPlaceholder sortable={false} onSelect={() => undefined} onToggleFavorite={() => undefined} />
      ) : (
        <NewItemCategoryCard {...props} sortable={false} />
      )}
    </div>
  );
}

export function getCategoryLabel(
  t: (messageKey: string, values?: WebMessageValues) => string,
  category: ItemCategoryDefinition,
): string {
  return t(category.labelKey);
}
