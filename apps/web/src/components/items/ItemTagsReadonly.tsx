import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";

type ItemTagsReadonlyProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  tags: readonly string[];
};

const tagPillClassName = cn(
  "inline-flex h-[26px] shrink-0 items-center rounded-full bg-slate-100 px-2.5 text-sm text-foreground",
  "dark:bg-muted",
);

export default function ItemTagsReadonly({ t, tags }: ItemTagsReadonlyProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-4">
      <span className="text-sm text-foreground">{t("web.newItemPopup.tagsLabel")}</span>
      {tags.map((tag) => (
        <span key={tag} className={tagPillClassName}>
          <span className="max-w-[12rem] truncate">{tag}</span>
        </span>
      ))}
    </div>
  );
}
