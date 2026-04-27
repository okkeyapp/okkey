import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Favicon,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidebarGroupLabel,
} from "@okkey/ui";
import type { WebLocale } from "@okkey/i18n";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { useSearchParams } from "react-router-dom";

import { useLocale } from "../../locale/LocaleContext";
import { ITEM_QUERY_PARAM } from "../../routes/paths";

import itemsListDemoWire from "./itemsListLeftPane.demo.json";

const itemsPanelSelectTriggerClassName = cn(
  "h-9 min-h-9 rounded-lg border-0 bg-slate-100 shadow-none dark:bg-muted",
  "px-2 text-sm text-foreground",
  "hover:bg-slate-200/90 dark:hover:bg-muted/80",
  "focus:border-transparent focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] focus-visible:border-transparent",
  "data-[state=open]:border-transparent data-[state=open]:bg-slate-200/90 dark:data-[state=open]:bg-muted/90",
  "data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
);

export type ItemsListRecordWire = {
  id: string;
  urls: string[];
  title: string;
  login: string;
  date: string;
  favorite?: boolean;
  archived?: boolean;
  deleted?: boolean;
};

export type ItemsListRecord = {
  id: string;
  urls: string[];
  title: string;
  login: string;
  date: Date;
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
};

const ITEMS_LIST_DEMO: readonly ItemsListRecord[] = (itemsListDemoWire as readonly ItemsListRecordWire[]).map(
  (row) => ({
    id: row.id,
    urls: row.urls ?? [],
    title: row.title,
    login: row.login,
    date: new Date(row.date),
    favorite: Boolean(row.favorite),
    archived: Boolean(row.archived),
    deleted: Boolean(row.deleted),
  }),
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

/** Сначала новые — `date_desc` */
function SortIconNewestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M11.3333 9.3335C11.687 9.3335 12.0261 9.47397 12.2761 9.72402C12.5262 9.97407 12.6667 10.3132 12.6667 10.6668V12.6668C12.6667 13.0205 12.5262 13.3596 12.2761 13.6096C12.0261 13.8597 11.687 14.0002 11.3333 14.0002C10.9797 14.0002 10.6406 13.8597 10.3905 13.6096C10.1405 13.3596 10 13.0205 10 12.6668V10.6668C10 10.3132 10.1405 9.97407 10.3905 9.72402C10.6406 9.47397 10.9797 9.3335 11.3333 9.3335Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 3.33333C10 3.68696 10.1405 4.02609 10.3905 4.27614C10.6406 4.52619 10.9797 4.66667 11.3333 4.66667C11.687 4.66667 12.0261 4.52619 12.2761 4.27614C12.5262 4.02609 12.6667 3.68696 12.6667 3.33333C12.6667 2.97971 12.5262 2.64057 12.2761 2.39052C12.0261 2.14048 11.687 2 11.3333 2C10.9797 2 10.6406 2.14048 10.3905 2.39052C10.1405 2.64057 10 2.97971 10 3.33333Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 3.3335V5.3335C12.6667 5.68712 12.5262 6.02626 12.2762 6.2763C12.0261 6.52635 11.687 6.66683 11.3334 6.66683H10.3334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Сначала старые — `date_asc` */
function SortIconOldestFirst({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M11.3333 2C11.687 2 12.0261 2.14048 12.2761 2.39052C12.5262 2.64057 12.6667 2.97971 12.6667 3.33333V5.33333C12.6667 5.68696 12.5262 6.02609 12.2761 6.27614C12.0261 6.52619 11.687 6.66667 11.3333 6.66667C10.9797 6.66667 10.6406 6.52619 10.3905 6.27614C10.1405 6.02609 10 5.68696 10 5.33333V3.33333C10 2.97971 10.1405 2.64057 10.3905 2.39052C10.6406 2.14048 10.9797 2 11.3333 2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 10.6668C10 11.0205 10.1405 11.3596 10.3905 11.6096C10.6406 11.8597 10.9797 12.0002 11.3333 12.0002C11.687 12.0002 12.0261 11.8597 12.2761 11.6096C12.5262 11.3596 12.6667 11.0205 12.6667 10.6668C12.6667 10.3132 12.5262 9.97407 12.2761 9.72402C12.0261 9.47397 11.687 9.3335 11.3333 9.3335C10.9797 9.3335 10.6406 9.47397 10.3905 9.72402C10.1405 9.97407 10 10.3132 10 10.6668Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6667 10.6665V12.6665C12.6667 13.0201 12.5262 13.3593 12.2762 13.6093C12.0261 13.8594 11.687 13.9998 11.3334 13.9998H10.3334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Алфавит — `name_asc` */
function SortIconAlphaAsc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M10 6.66667V3.33333C10 2.41333 10.4133 2 11.3333 2C12.2533 2 12.6667 2.41333 12.6667 3.33333V6.66667M12.6667 4.66667H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6667 14.0002H10L12.6667 9.3335H10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Обратный алфавит — `name_desc` */
function SortIconAlphaDesc({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M10 14.0002V10.6668C10 9.74683 10.4133 9.3335 11.3333 9.3335C12.2533 9.3335 12.6667 9.74683 12.6667 10.6668V14.0002M12.6667 12.0002H10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.6667 6.66667H10L12.6667 2H10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 10L4.66663 12L6.66663 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66663 4V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function sortIconForValue(value: ItemsListSort, className?: string) {
  const common = { className: cn("text-foreground", className) };
  switch (value) {
    case "date_desc":
      return <SortIconNewestFirst {...common} />;
    case "date_asc":
      return <SortIconOldestFirst {...common} />;
    case "name_asc":
      return <SortIconAlphaAsc {...common} />;
    case "name_desc":
      return <SortIconAlphaDesc {...common} />;
    default: {
      const _ex: never = value;
      return _ex;
    }
  }
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

function IconEdit16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M9.99992 3.33333L12.6666 6M14.1159 4.54126C14.4683 4.18888 14.6664 3.71091 14.6665 3.2125C14.6665 2.71409 14.4686 2.23607 14.1162 1.8836C13.7638 1.53112 13.2859 1.33307 12.7874 1.33301C12.289 1.33295 11.811 1.53088 11.4585 1.88326L2.56121 10.7826C2.40642 10.9369 2.29195 11.127 2.22787 11.3359L1.34721 14.2373C1.32998 14.2949 1.32868 14.3562 1.34344 14.4145C1.35821 14.4728 1.38849 14.5261 1.43107 14.5686C1.47366 14.6111 1.52696 14.6413 1.58531 14.656C1.64367 14.6707 1.70491 14.6693 1.76254 14.6519L4.66454 13.7719C4.87332 13.7084 5.06332 13.5947 5.21787 13.4406L14.1159 4.54126Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSelect16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M14.6673 7.38723V8.00056C14.6665 9.43818 14.201 10.837 13.3402 11.9884C12.4794 13.1399 11.2695 13.9822 9.89089 14.3898C8.51227 14.7974 7.03882 14.7485 5.6903 14.2503C4.34177 13.7521 3.19042 12.8313 2.40796 11.6253C1.6255 10.4193 1.25385 8.9926 1.34844 7.5581C1.44303 6.1236 1.99879 4.75811 2.93284 3.66528C3.86689 2.57244 5.12917 1.81082 6.53144 1.49399C7.93371 1.17717 9.40083 1.32212 10.714 1.90723M6.00065 7.33382L8.00065 9.33382L14.6673 2.66715"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDelete16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-3.5 shrink-0", className)}>
      <path d="M13.3327 4L5.99935 11.3333L2.66602 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClose16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4", className)}>
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export type ItemsListFilter = "all" | "favorites" | "archived" | "recently_deleted";
export type ItemsListSort = "name_asc" | "name_desc" | "date_asc" | "date_desc";

function firstGrapheme(s: string): string {
  const t = s.trim();
  if (!t) {
    return "";
  }
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = [...seg.segment(t)][0];
    return first?.segment ?? "";
  }
  return [...t][0] ?? "";
}

function alphaGroupKeyAndLabel(title: string, locale: WebLocale): { key: string; label: string } {
  const g = firstGrapheme(title);
  if (!g) {
    return { key: "#", label: "#" };
  }
  if (!/\p{L}/u.test(g)) {
    return { key: "#", label: "#" };
  }
  const loc = locale === "ru" ? "ru" : "en";
  const label = g.toLocaleUpperCase(loc).normalize("NFC");
  return { key: label, label };
}

function compareAlphaSectionKeys(a: string, b: string, ascending: boolean): number {
  const rank = (x: string, y: string) => {
    if (x === "#") {
      return y === "#" ? 0 : -1;
    }
    if (y === "#") {
      return 1;
    }
    return x.localeCompare(y, "ru", { sensitivity: "base" });
  };
  const r = rank(a, b);
  return ascending ? r : -r;
}

function formatYearMonthHeading(locale: WebLocale, d: Date): string {
  const y = d.getFullYear();
  const month = new Intl.DateTimeFormat(locale === "ru" ? "ru" : "en-US", { month: "long" }).format(d);
  return locale === "ru" ? `${y} ${month}` : `${month} ${y}`;
}

function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonthKey(key: string): Date {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  return new Date(Number.isFinite(y) && Number.isFinite(m) ? y : 1970, Number.isFinite(m) ? m - 1 : 0, 1);
}

function compareYearMonthKeys(a: string, b: string, ascending: boolean): number {
  const ta = parseYearMonthKey(a).getTime();
  const tb = parseYearMonthKey(b).getTime();
  const r = ta - tb;
  return ascending ? r : -r;
}

function sortItems(items: readonly ItemsListRecord[], sort: ItemsListSort): ItemsListRecord[] {
  const copy = [...items];
  copy.sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
      case "name_desc":
        return b.title.localeCompare(a.title, "ru", { sensitivity: "base" });
      case "date_asc":
        return a.date.getTime() - b.date.getTime();
      case "date_desc":
        return b.date.getTime() - a.date.getTime();
      default: {
        const _ex: never = sort;
        return _ex;
      }
    }
  });
  return copy;
}

function filterItems(items: readonly ItemsListRecord[], filter: ItemsListFilter): ItemsListRecord[] {
  switch (filter) {
    case "all":
      return items.filter((r) => !r.deleted && !r.archived);
    case "favorites":
      return items.filter((r) => !r.deleted && !r.archived && r.favorite);
    case "archived":
      return items.filter((r) => !r.deleted && r.archived);
    case "recently_deleted":
      return items.filter((r) => r.deleted);
    default: {
      const _ex: never = filter;
      return _ex;
    }
  }
}

type ListSection = { key: string; label: string; rows: ItemsListRecord[] };

function buildSections(sorted: readonly ItemsListRecord[], sort: ItemsListSort, locale: WebLocale): ListSection[] {
  const isDate = sort === "date_asc" || sort === "date_desc";
  if (isDate) {
    const map = new Map<string, ItemsListRecord[]>();
    for (const row of sorted) {
      const k = yearMonthKey(row.date);
      const prev = map.get(k);
      if (prev) {
        prev.push(row);
      } else {
        map.set(k, [row]);
      }
    }
    const asc = sort === "date_asc";
    const keys = [...map.keys()].sort((a, b) => compareYearMonthKeys(a, b, asc));
    return keys.map((key) => ({
      key,
      label: formatYearMonthHeading(locale, parseYearMonthKey(key)),
      rows: map.get(key) ?? [],
    }));
  }

  const map = new Map<string, { label: string; rows: ItemsListRecord[] }>();
  for (const row of sorted) {
    const { key, label } = alphaGroupKeyAndLabel(row.title, locale);
    const bucket = map.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      map.set(key, { label, rows: [row] });
    }
  }
  const asc = sort === "name_asc";
  const keys = [...map.keys()].sort((a, b) => compareAlphaSectionKeys(a, b, asc));
  return keys.map((key) => {
    const v = map.get(key)!;
    return { key, label: v.label, rows: v.rows };
  });
}

export default function ItemsListLeftPane() {
  const { locale, t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeItemId = searchParams.get(ITEM_QUERY_PARAM)?.trim() ?? "";

  const [filter, setFilter] = useState<ItemsListFilter>("all");
  const [sort, setSort] = useState<ItemsListSort>("date_desc");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const sections = useMemo(() => {
    const filtered = filterItems(ITEMS_LIST_DEMO, filter);
    const sorted = sortItems(filtered, sort);
    return buildSections(sorted, sort, locale);
  }, [filter, sort, locale]);

  const totalRows = useMemo(() => sections.reduce((n, s) => n + s.rows.length, 0), [sections]);

  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedIds]);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const enterSelectionModeWith = (id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectItemInUrl = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(ITEM_QUERY_PARAM, id);
        return next;
      },
      { replace: true },
    );
  };

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("web.items.list.sortAria")}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-slate-100 p-0 text-foreground shadow-none dark:bg-muted",
                  "hover:bg-slate-200/90 hover:text-foreground dark:hover:bg-muted/80",
                  "focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)]",
                  "data-[state=open]:bg-slate-200/90 data-[state=open]:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.35)] dark:data-[state=open]:bg-muted/90",
                )}
              >
                {sortIconForValue(sort)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12.5rem] p-1">
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByDate")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "date_desc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSort("date_desc")}
                >
                  <SortIconNewestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateDesc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "date_asc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSort("date_asc")}
                >
                  <SortIconOldestFirst className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.dateAsc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuGroup className="p-0">
                <SidebarGroupLabel className="pointer-events-none">{t("web.items.sort.groupByAlphabet")}</SidebarGroupLabel>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "name_asc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSort("name_asc")}
                >
                  <SortIconAlphaAsc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameAsc")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    "gap-2 whitespace-nowrap py-2 ps-2 pe-3",
                    sort === "name_desc" && "bg-muted/80 data-[highlighted]:bg-secondary",
                  )}
                  onSelect={() => setSort("name_desc")}
                >
                  <SortIconAlphaDesc className="size-4 shrink-0 text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t("web.items.sort.nameDesc")}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {totalRows === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-10">
            <p className="okkey-body text-center text-sm text-muted-foreground">{t("web.items.list.empty")}</p>
          </div>
        ) : (
          <div className="pt-2">
            {sections.map((section) => (
              <section key={section.key} className="pb-2">
                <h2 className="okkey-body px-5 py-2 text-sm font-medium text-foreground">{section.label}</h2>
                <ul className="flex flex-col gap-0 px-2" role="list">
                  {section.rows.map((row) => {
                    const rowSelected = selectedIds.has(row.id);
                    const rowActive = activeItemId === row.id;
                    return (
                      <li key={row.id}>
                        <div
                          className={cn(
                            "group flex w-full min-h-[44px] items-center gap-0 overflow-hidden rounded-lg transition-colors",
                            "hover:bg-muted/60",
                            rowActive && "bg-muted/80",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={selectionMode ? t("web.items.list.toggleRowAria") : undefined}
                            aria-current={rowActive ? "true" : undefined}
                            onClick={
                              selectionMode
                                ? () => toggleRowSelected(row.id)
                                : () => {
                                    selectItemInUrl(row.id);
                                  }
                            }
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-3 py-2.5 text-left"
                          >
                            <Favicon urls={row.urls.length ? row.urls : undefined} size={32} className="shrink-0 bg-background" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                              <span className="block truncate text-sm text-muted-foreground">{row.login}</span>
                            </span>
                          </button>

                          <div className="flex shrink-0 self-center pe-1.5">
                            {selectionMode ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="iconSm"
                                aria-label={t("web.items.list.toggleRowAria")}
                                aria-pressed={rowSelected}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowSelected(row.id);
                                }}
                                className={cn(
                                  "size-8 shrink-0 rounded-full border border-transparent transition-colors",
                                  rowSelected
                                    ? "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-foreground/[0.04] text-foreground/45 hover:bg-foreground/[0.08] hover:text-foreground/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.12]",
                                )}
                              >
                                <IconCheck16 className={rowSelected ? "text-primary-foreground" : undefined} />
                              </Button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="iconSm"
                                    className={cn(
                                      "size-8 shrink-0 text-muted-foreground opacity-0 transition-colors transition-opacity",
                                      "hover:bg-muted/90 hover:text-foreground group-hover:opacity-100",
                                      "data-[state=open]:bg-muted/90 data-[state=open]:opacity-100 data-[state=open]:text-foreground dark:hover:bg-muted/70 dark:data-[state=open]:bg-muted/70",
                                    )}
                                    aria-label={t("web.items.list.rowMenuAria")}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVerticalIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 p-1">
                                  <DropdownMenuItem className="gap-2" onSelect={() => undefined}>
                                    <IconEdit16 />
                                    <span>{t("web.items.menu.edit")}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2" onSelect={() => enterSelectionModeWith(row.id)}>
                                    <IconSelect16 />
                                    <span>{t("web.items.menu.select")}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive"
                                    onSelect={() => undefined}
                                  >
                                    <IconDelete16 className="text-destructive" />
                                    <span>{t("web.items.menu.delete")}</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>

      {selectionMode ? (
        <div className="flex shrink-0 items-center border-t border-border bg-background px-2 py-2">
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("web.items.list.exitSelectionAria")}
            onClick={exitSelectionMode}
          >
            <IconClose16 />
          </Button>
          <p className="ms-2 min-w-0 flex-1 truncate text-left text-sm text-foreground">
            {t("web.items.list.selectionCount", { count: selectedIds.size })}
          </p>
          <Button type="button" variant="destructive" size="sm" className="ms-auto shrink-0 gap-2">
            <IconDelete16 />
            {t("web.items.list.deleteMany")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
