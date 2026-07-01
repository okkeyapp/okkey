import { Favicon } from "@okkey/ui";
import * as React from "react";

import { buildItemFaviconUrl } from "../../api/item-favicons";
import { getItemCategoryDefinition, isItemCategoryId } from "./itemCategoryCatalog";
import { ItemCategoryIcon, type CategoryIconPixelSize } from "./itemCategoryIcons";

const LOGIN_CATEGORY_ID = "login" as const;

function categoryIconPixelSize(tileSize: number): CategoryIconPixelSize {
  return tileSize >= 40 ? 24 : 16;
}

export function isLoginItemCategory(categoryId: string): boolean {
  return categoryId === LOGIN_CATEGORY_ID;
}

type ItemRecordFaviconProps = {
  categoryId: string;
  title?: string;
  faviconId?: string;
  previewImageSrc?: string;
  previewLoading?: boolean;
  /** @deprecated Use `faviconId` — kept for form preview before first save. */
  urls?: readonly string[];
  size?: number;
  className?: string;
  alt?: string;
  /** When true, image uses native lazy loading (list rows). */
  lazy?: boolean;
};

/** Login/password: stored favicon, monogram, or category icon. Other categories: category icon only. */
export default function ItemRecordFavicon({
  categoryId,
  title,
  faviconId,
  previewImageSrc,
  previewLoading = false,
  urls,
  size = 32,
  className,
  alt = "",
  lazy = false,
}: ItemRecordFaviconProps) {
  const category = isItemCategoryId(categoryId) ? getItemCategoryDefinition(categoryId) : undefined;
  const categoryIcon = category ? (
    <ItemCategoryIcon
      categoryId={category.id}
      pixelSize={categoryIconPixelSize(size)}
      className="shrink-0 text-white"
    />
  ) : undefined;

  const imageSrc = previewImageSrc ?? (faviconId ? buildItemFaviconUrl(faviconId) : undefined);
  const skeletonWhileLoading = previewLoading || previewImageSrc != null;

  if (isLoginItemCategory(categoryId)) {
    return (
      <Favicon
        name={title}
        imageSrc={imageSrc}
        loading={previewLoading}
        skeletonWhileLoading={skeletonWhileLoading}
        lazy={lazy}
        size={size}
        color={category?.iconColor}
        className={className}
        alt={alt}
        icon={categoryIcon}
      />
    );
  }

  return (
    <Favicon
      size={size}
      color={category?.iconColor}
      className={className}
      alt={alt}
      icon={categoryIcon}
    />
  );
}

type LazyItemRecordFaviconProps = Omit<ItemRecordFaviconProps, "lazy">;

/** List row favicon: native lazy loading for stored images. */
export function LazyItemRecordFavicon(props: LazyItemRecordFaviconProps) {
  return <ItemRecordFavicon {...props} lazy />;
}
