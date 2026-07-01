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
  /** When true, image uses native lazy loading (list rows after intersection). */
  lazy?: boolean;
  /** When false, stored image is not requested yet (intersection gate for lists). */
  loadImage?: boolean;
};

function useLazyVisible(rootMargin = "120px"): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || visible) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return [ref, visible];
}

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
  loadImage = true,
}: ItemRecordFaviconProps) {
  const category = isItemCategoryId(categoryId) ? getItemCategoryDefinition(categoryId) : undefined;
  const categoryIcon = category ? (
    <ItemCategoryIcon
      categoryId={category.id}
      pixelSize={categoryIconPixelSize(size)}
      className="shrink-0 text-white"
    />
  ) : undefined;

  const imageSrc =
    loadImage && (previewImageSrc ?? (faviconId ? buildItemFaviconUrl(faviconId) : undefined));

  if (isLoginItemCategory(categoryId)) {
    return (
      <Favicon
        name={title}
        imageSrc={imageSrc}
        loading={previewLoading}
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

type LazyItemRecordFaviconProps = Omit<ItemRecordFaviconProps, "lazy" | "loadImage">;

/** List row favicon: waits for viewport intersection before loading the stored image. */
export function LazyItemRecordFavicon(props: LazyItemRecordFaviconProps) {
  const [ref, visible] = useLazyVisible();
  return (
    <div ref={ref} className="shrink-0" style={{ width: props.size ?? 32, height: props.size ?? 32 }}>
      <ItemRecordFavicon {...props} lazy={visible} loadImage={visible} />
    </div>
  );
}
