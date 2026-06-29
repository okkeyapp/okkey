import type { WebMessageValues } from "@okkey/i18n";
import { Button, buttonVariants, cn } from "@okkey/ui";
import { useMemo, useState } from "react";

import type { ItemActivityEntry } from "../../items/buildItemActivityEntries";
import { useLocale } from "../../locale/LocaleContext";

type ItemActivitySectionProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  entries: readonly ItemActivityEntry[];
};

const iconButtonClassName = cn(buttonVariants({ variant: "outline", size: "icon" }), "!size-8 !min-h-8 !min-w-8");

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("size-4 shrink-0 transition-transform", !expanded && "-rotate-90", className)}
    >
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatActivityLine(
  entry: ItemActivityEntry,
  locale: string,
  t: (messageKey: string, values?: WebMessageValues) => string,
): string {
  const date = new Date(entry.atMs);
  const datePart = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (entry.actionKey === "created") {
    return t("web.items.detail.activity.createdLine", { date: datePart, time: timePart, actor: entry.actorLabel });
  }
  return t("web.items.detail.activity.updatedLine", { date: datePart, time: timePart, actor: entry.actorLabel });
}

export default function ItemActivitySection({ t, entries }: ItemActivitySectionProps) {
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const visibleEntries = useMemo(() => (expanded ? entries : entries.slice(0, 1)), [entries, expanded]);
  const canExpand = entries.length > 1;

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="pt-2">
      <div className="flex items-start gap-3">
        {canExpand ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(iconButtonClassName, "shrink-0")}
            aria-label={expanded ? t("web.items.detail.activity.collapse") : t("web.items.detail.activity.expand")}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronIcon expanded={expanded} />
          </Button>
        ) : null}

        <ul className="min-w-0 flex-1">
          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;

            return (
              <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="relative flex w-3 shrink-0 justify-center pt-1.5">
                  {!isLast ? <span className="absolute top-3 bottom-0 w-px bg-border" aria-hidden /> : null}
                  <span className="relative z-[1] size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                </div>
                <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
                  {formatActivityLine(entry, locale, t)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
