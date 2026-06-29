import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";

type ItemTagsReadonlyProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  tags: readonly string[];
  onTagClick?: (tag: string) => void;
};

const tagPillClassName = cn(
  "inline-flex h-[26px] shrink-0 items-center rounded-full bg-slate-100 px-2.5 text-sm text-foreground",
  "dark:bg-muted",
);

const tagPillInteractiveClassName = cn(
  tagPillClassName,
  "cursor-pointer transition-colors hover:bg-slate-200/90 dark:hover:bg-muted/80",
);

export default function ItemTagsReadonly({ t, tags, onTagClick }: ItemTagsReadonlyProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-4">
      <span className="text-sm text-foreground">{t("web.newItemPopup.tagsLabel")}</span>
      {tags.map((tag) =>
        onTagClick ? (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            className={tagPillInteractiveClassName}
          >
            <span className="max-w-[12rem] truncate">{tag}</span>
          </button>
        ) : (
          <span key={tag} className={tagPillClassName}>
            <span className="max-w-[12rem] truncate">{tag}</span>
          </span>
        ),
      )}
    </div>
  );
}
