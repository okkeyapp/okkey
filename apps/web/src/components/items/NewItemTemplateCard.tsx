import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { ItemFaviconSource } from "@okkey/types";
import { Button, cn } from "@okkey/ui";

import ItemRecordFavicon from "./ItemRecordFavicon";
import { getItemCategoryDefinition, isItemCategoryId } from "./itemCategoryCatalog";
import { ItemCategoryIcon, StarIcon } from "./itemCategoryIcons";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";

export type NewItemTemplateCardProps = {
  templateId: string;
  vaultId: string;
  label: string;
  categoryId: string;
  faviconId?: string;
  faviconSource?: ItemFaviconSource;
  isFavorite: boolean;
  favoriteAriaLabel: string;
  size?: "featured" | "compact";
  isReorderMode?: boolean;
  isDragging?: boolean;
  isDropPlaceholder?: boolean;
  sortable?: boolean;
  sortableId?: string;
  wiggleIndex?: number;
  onSelect: () => void;
  onToggleFavorite: () => void;
};

function templateWiggleStyle(wiggleIndex: number): CSSProperties {
  return {
    animationDelay: `${(wiggleIndex % 5) * 0.13}s`,
    animationDuration: `${0.32 + (wiggleIndex % 4) * 0.06}s`,
  };
}

const templateCardInteractiveClassName =
  "outline-none hover:border-primary focus-visible:border-accent focus-visible:bg-background focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] active:border-accent active:bg-background active:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]";

export default function NewItemTemplateCard({
  templateId,
  vaultId,
  label,
  categoryId,
  faviconId,
  isFavorite,
  favoriteAriaLabel,
  size = "compact",
  isReorderMode = false,
  isDragging = false,
  isDropPlaceholder = false,
  sortable = false,
  sortableId,
  wiggleIndex = 0,
  onSelect,
  onToggleFavorite,
}: NewItemTemplateCardProps) {
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
    size === "featured" ? "size-10 shrink-0 rounded-lg" : "size-6 shrink-0 rounded";
  const category = isItemCategoryId(categoryId) ? getItemCategoryDefinition(categoryId) : undefined;
  const { accessToken, vaultKey } = useAuthVault();
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey,
    vaultId,
    itemId: templateId,
    faviconId,
  });

  const card = (
    <div
      className={cn(
        "relative flex items-center gap-4 rounded-lg border border-border bg-background p-4 text-left transition-[border-color,box-shadow,background-color]",
        isDragging && "shadow-md",
        isReorderMode ? "cursor-grab active:cursor-grabbing" : cn("cursor-pointer", templateCardInteractiveClassName),
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
      {faviconId ? (
        <ItemRecordFavicon
          categoryId={categoryId}
          faviconId={faviconId}
          previewImageSrc={faviconUrl.imageSrc}
          previewLoading={faviconUrl.loading}
          size={size === "featured" ? 40 : 24}
          className={iconBoxClassName}
        />
      ) : category ? (
        <div
          className={cn("flex items-center justify-center text-white", iconBoxClassName)}
          style={{ backgroundColor: category.iconColor }}
          aria-hidden
        >
          <ItemCategoryIcon
            categoryId={category.id}
            pixelSize={iconPixelSize}
            className="shrink-0 text-white"
          />
        </div>
      ) : (
        <ItemRecordFavicon
          categoryId={categoryId}
          size={size === "featured" ? 40 : 24}
          className={iconBoxClassName}
        />
      )}
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

  const wiggleWrapperClassName = cn(isReorderMode && !isDragging && "animate-category-wiggle");
  const wiggleWrapperStyle = isReorderMode && !isDragging ? templateWiggleStyle(wiggleIndex) : undefined;

  if (!sortable) {
    return (
      <div className={wiggleWrapperClassName} style={wiggleWrapperStyle}>
        {card}
      </div>
    );
  }

  return (
    <SortableNewItemTemplateCard
      templateId={templateId}
      vaultId={vaultId}
      label={label}
      categoryId={categoryId}
      faviconId={faviconId}
      isFavorite={isFavorite}
      favoriteAriaLabel={favoriteAriaLabel}
      size={size}
      isReorderMode={isReorderMode}
      wiggleIndex={wiggleIndex}
      sortableId={sortableId}
      onSelect={onSelect}
      onToggleFavorite={onToggleFavorite}
    />
  );
}

function SortableNewItemTemplateCard(
  props: Omit<NewItemTemplateCardProps, "sortable" | "isDragging" | "isDropPlaceholder">,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.sortableId ?? props.templateId,
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
        <NewItemTemplateCard
          {...props}
          isDropPlaceholder
          sortable={false}
          onSelect={() => undefined}
          onToggleFavorite={() => undefined}
        />
      ) : (
        <NewItemTemplateCard {...props} sortable={false} />
      )}
    </div>
  );
}
