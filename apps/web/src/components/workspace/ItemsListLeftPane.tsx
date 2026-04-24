import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Favicon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@okkey/ui";
import type { WebLocale } from "@okkey/i18n";
import { useMemo, useState, type SVGProps } from "react";

import { useLocale } from "../../locale/LocaleContext";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  "hover:bg-slate-200/90 dark:hover:bg-muted/80",
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  "data-[state=open]:border-transparent data-[state=open]:bg-slate-200/90 dark:data-[state=open]:bg-muted/90",
  "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

function FilterGlyph({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex size-6 shrink-0 items-center justify-center rounded bg-background", className)}
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="6" height="6" rx="1" fill="#22c55e" />
        <rect x="9" y="1" width="6" height="6" rx="1" fill="#ec4899" />
        <rect x="1" y="9" width="6" height="6" rx="1" fill="#3b82f6" />
        <rect x="9" y="9" width="6" height="6" rx="1" fill="#eab308" />
      </svg>
    </span>
  );
}

function SortGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0 text-foreground", className)}
      {...props}
    >
      <path d="M5 3v10M5 3l2 2M5 3L3 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 13V3m0 10l2-2m-2 2l-2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreVerticalIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4", className)} {...props}>
      <circle cx="8" cy="3" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="13" r="1.25" fill="currentColor" />
    </svg>
  );
}

export type ItemsListFilter = "all" | "favorites" | "archived" | "recently_deleted";
export type ItemsListSort = "name_asc" | "name_desc" | "date_asc" | "date_desc";

type DemoRow = {
  id: string;
  title: string;
  subtitle: string;
  host: string;
  /** First day of month for section grouping. */
  section: Date;
};

const DEMO_ROWS: DemoRow[] = [
  { id: "1", title: "Google", subtitle: "shadcn@vercel.com", host: "google.com", section: new Date(2026, 1, 1) },
  { id: "2", title: "Yandex", subtitle: "shadcn@vercel.com", host: "yandex.ru", section: new Date(2026, 1, 1) },
  { id: "3", title: "GOG.com", subtitle: "shadcn@vercel.com", host: "gog.com", section: new Date(2026, 1, 1) },
  { id: "4", title: "VK", subtitle: "shadcn@vercel.com", host: "vk.com", section: new Date(2026, 1, 1) },
  { id: "5", title: "Одноклассники", subtitle: "shadcn@vercel.com", host: "ok.ru", section: new Date(2026, 1, 1) },
  { id: "6", title: "Github", subtitle: "shadcn@vercel.com", host: "github.com", section: new Date(2025, 11, 1) },
  { id: "7", title: "Docker", subtitle: "shadcn@vercel.com", host: "docker.com", section: new Date(2025, 11, 1) },
  { id: "8", title: "Jetbrains", subtitle: "shadcn@vercel.com", host: "jetbrains.com", section: new Date(2025, 11, 1) },
];

function formatSectionHeading(locale: WebLocale, d: Date): string {
  const y = d.getFullYear();
  const month = new Intl.DateTimeFormat(locale === "ru" ? "ru" : "en-US", { month: "long" }).format(d);
  return locale === "ru" ? `${y} ${month}` : `${month} ${y}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export default function ItemsListLeftPane() {
  const { locale, t } = useLocale();
  const [filter, setFilter] = useState<ItemsListFilter>("all");
  const [sort, setSort] = useState<ItemsListSort>("date_desc");
  const [selectedId, setSelectedId] = useState<string>("2");

  const sections = useMemo(() => {
    const map = new Map<string, { label: string; rows: DemoRow[] }>();
    for (const row of DEMO_ROWS) {
      const key = monthKey(row.section);
      const label = formatSectionHeading(locale, row.section);
      const bucket = map.get(key);
      if (bucket) {
        bucket.rows.push(row);
      } else {
        map.set(key, { label, rows: [row] });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => ({ key, ...v }));
  }, [locale]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <div className="flex w-full items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as ItemsListFilter)}>
            <SelectTrigger
              aria-label={t("web.items.list.filterAria")}
              className={cn(itemsPanelSelectTriggerClassName, "min-w-0 flex-1 gap-2 [&>svg]:shrink-0")}
            >
              <FilterGlyph />
              <SelectValue placeholder={t("web.items.filter.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("web.items.filter.all")}</SelectItem>
              <SelectItem value="favorites">{t("web.items.filter.favorites")}</SelectItem>
              <SelectItem value="archived">{t("web.items.filter.archived")}</SelectItem>
              <SelectItem value="recently_deleted">{t("web.items.filter.recentlyDeleted")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as ItemsListSort)}>
            <SelectTrigger
              aria-label={t("web.items.list.sortAria")}
              className={cn(
                itemsPanelSelectTriggerClassName,
                "w-[min(100%,9.5rem)] shrink-0 gap-1.5 px-2 sm:w-[10.5rem]",
                "[&>svg]:shrink-0",
              )}
            >
              <SortGlyph className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="name_asc">{t("web.items.sort.nameAsc")}</SelectItem>
              <SelectItem value="name_desc">{t("web.items.sort.nameDesc")}</SelectItem>
              <SelectItem value="date_asc">{t("web.items.sort.dateAsc")}</SelectItem>
              <SelectItem value="date_desc">{t("web.items.sort.dateDesc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-2">
        {sections.map((section) => (
          <section key={section.key} className="pb-2">
            <h2 className="okkey-body px-5 py-2 text-sm font-medium text-foreground">{section.label}</h2>
            <ul className="flex flex-col gap-0 px-2" role="list">
              {section.rows.map((row) => {
                const active = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <div
                      className={cn(
                        "flex w-full items-stretch overflow-hidden rounded-lg transition-colors",
                        active ? "bg-slate-100 dark:bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className="flex min-w-0 flex-1 items-center gap-4 px-3 py-2.5 text-left"
                      >
                        <Favicon urls={[`https://${row.host}`]} size={32} className="shrink-0 bg-background" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                          <span className="block truncate text-sm text-muted-foreground">{row.subtitle}</span>
                        </span>
                      </button>
                      {active ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="iconSm"
                              className="my-1 me-1 shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label={t("web.items.list.rowMenuAria")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVerticalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem disabled>{t("web.items.list.rowMenuPlaceholder")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
