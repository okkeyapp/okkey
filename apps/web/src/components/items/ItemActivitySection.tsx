import type { WebMessageValues } from "@okkey/i18n";
import { Button, buttonVariants, cn } from "@okkey/ui";
import { useMemo, useState } from "react";

import type { ItemActivityEntry } from "../../items/buildItemActivityEntries";
import { useLocale } from "../../locale/LocaleContext";

type ItemActivitySectionProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  entries: readonly ItemActivityEntry[];
};

const timelineToggleClassName = cn(
  buttonVariants({ variant: "secondary", size: "icon" }),
  "!size-6 !min-h-6 !min-w-6 shrink-0",
);

const timelineShowMoreClassName = cn(
  buttonVariants({ variant: "secondary", size: "sm" }),
  "h-6 min-h-6 rounded-md px-3 text-sm",
);

const TIMELINE_LINE_CENTER_PX = 10;
const TIMELINE_ITEM_GAP_PX = 10;
const TIMELINE_OPEN_VISIBLE_COUNT = 10;

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={cn("size-3.5 shrink-0 transition-transform", !expanded && "-rotate-90", className)}
    >
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityCalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M2.66663 4.66683C2.66663 4.31321 2.8071 3.97407 3.05715 3.72402C3.3072 3.47397 3.64634 3.3335 3.99996 3.3335H12C12.3536 3.3335 12.6927 3.47397 12.9428 3.72402C13.1928 3.97407 13.3333 4.31321 13.3333 4.66683V12.6668C13.3333 13.0205 13.1928 13.3596 12.9428 13.6096C12.6927 13.8597 12.3536 14.0002 12 14.0002H3.99996C3.64634 14.0002 3.3072 13.8597 3.05715 13.6096C2.8071 13.3596 2.66663 13.0205 2.66663 12.6668V4.66683Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.6666 2V4.66667" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.33337 2V4.66667" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 7.3335H13.3333" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M7.33337 10.6667C7.33337 10.8435 7.40361 11.013 7.52864 11.1381C7.65366 11.2631 7.82323 11.3333 8.00004 11.3333C8.17685 11.3333 8.34642 11.2631 8.47145 11.1381C8.59647 11.013 8.66671 10.8435 8.66671 10.6667C8.66671 10.4899 8.59647 10.3203 8.47145 10.1953C8.34642 10.0702 8.17685 10 8.00004 10C7.82323 10 7.65366 10.0702 7.52864 10.1953C7.40361 10.3203 7.33337 10.4899 7.33337 10.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  if (entry.actionKey === "archived") {
    return t("web.items.detail.activity.archivedLine", { date: datePart, time: timePart, actor: entry.actorLabel });
  }
  if (entry.actionKey === "unarchived") {
    return t("web.items.detail.activity.unarchivedLine", { date: datePart, time: timePart, actor: entry.actorLabel });
  }
  if (entry.actionKey === "deleted") {
    return t("web.items.detail.activity.deletedLine", { date: datePart, time: timePart, actor: entry.actorLabel });
  }
  if (entry.actionKey === "restored") {
    return t("web.items.detail.activity.restoredLine", { date: datePart, time: timePart, actor: entry.actorLabel });
  }
  return t("web.items.detail.activity.updatedLine", { date: datePart, time: timePart, actor: entry.actorLabel });
}

export default function ItemActivitySection({ t, entries }: ItemActivitySectionProps) {
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const canExpand = entries.length > 1;

  const visibleEntries = useMemo(() => {
    if (!expanded) {
      return entries.slice(0, 1);
    }
    if (showAll || entries.length <= TIMELINE_OPEN_VISIBLE_COUNT) {
      return entries;
    }
    return entries.slice(0, TIMELINE_OPEN_VISIBLE_COUNT);
  }, [entries, expanded, showAll]);

  const hasMoreEntries = expanded && !showAll && entries.length > TIMELINE_OPEN_VISIBLE_COUNT;

  if (entries.length === 0) {
    return null;
  }

  function toggleExpanded() {
    setExpanded((value) => {
      const next = !value;
      if (!next) {
        setShowAll(false);
      }
      return next;
    });
  }

  if (!canExpand) {
    const entry = entries[0];
    if (!entry) {
      return null;
    }

    return (
      <section className="overflow-visible pt-0 md:pt-4">
        <div className="flex items-start gap-2">
          <ActivityCalendarIcon className="mt-0.5 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
            {formatActivityLine(entry, locale, t)}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-visible pt-0 md:pt-4">
      <div className="flex flex-col overflow-visible">
        {visibleEntries.map((entry, index) => {
          const isLast = index === visibleEntries.length - 1;
          const isFirst = index === 0;

          return (
            <div key={entry.id} className="flex gap-3 overflow-visible">
              <div className={cn("relative w-6 shrink-0 self-stretch overflow-visible", !isLast && "pb-2.5")}>
                <div className="relative z-[1] flex h-5 w-full shrink-0 items-center justify-center">
                  {isFirst && canExpand ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className={timelineToggleClassName}
                      aria-label={expanded ? t("web.items.detail.activity.collapse") : t("web.items.detail.activity.expand")}
                      aria-expanded={expanded}
                      onClick={toggleExpanded}
                    >
                      <ChevronIcon expanded={expanded} />
                    </Button>
                  ) : (
                    <span className="size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                  )}
                </div>
                {!isLast ? (
                  <span
                    className="absolute left-1/2 w-px -translate-x-1/2 bg-border"
                    style={{ top: TIMELINE_LINE_CENTER_PX, bottom: -TIMELINE_ITEM_GAP_PX }}
                    aria-hidden
                  />
                ) : null}
              </div>
              <p
                className={cn(
                  "min-w-0 flex-1 text-sm leading-5 text-muted-foreground",
                  !isLast && "pb-2.5",
                )}
              >
                {formatActivityLine(entry, locale, t)}
              </p>
            </div>
          );
        })}

        {hasMoreEntries ? (
          <div className="flex gap-3" style={{ marginTop: TIMELINE_ITEM_GAP_PX }}>
            <div className="w-6 shrink-0" aria-hidden />
            <Button type="button" variant="secondary" className={timelineShowMoreClassName} onClick={() => setShowAll(true)}>
              {t("web.items.detail.activity.showMore")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
