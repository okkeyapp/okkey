import { Favicon } from "@okkey/ui";

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
  urls?: readonly string[];
  size?: number;
  className?: string;
  alt?: string;
};

/** Login/password: remote favicon or monogram. Other categories: category icon only. */
export default function ItemRecordFavicon({
  categoryId,
  title,
  urls,
  size = 32,
  className,
  alt = "",
}: ItemRecordFaviconProps) {
  if (isLoginItemCategory(categoryId)) {
    return (
      <Favicon
        name={title}
        urls={urls?.length ? urls : undefined}
        size={size}
        className={className}
        alt={alt}
      />
    );
  }

  const category = isItemCategoryId(categoryId) ? getItemCategoryDefinition(categoryId) : undefined;

  return (
    <Favicon
      size={size}
      color={category?.iconColor}
      className={className}
      alt={alt}
      icon={
        category ? (
          <ItemCategoryIcon
            categoryId={category.id}
            pixelSize={categoryIconPixelSize(size)}
            className="shrink-0 text-white"
          />
        ) : undefined
      }
    />
  );
}
