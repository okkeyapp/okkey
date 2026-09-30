export type ItemsListSort = "date_desc" | "date_asc" | "name_asc" | "name_desc";

export type ItemsListSectionRow = {
  title: string;
  /** Used for date grouping. */
  date: Date;
};

export type ItemsListSection<TRow extends ItemsListSectionRow = ItemsListSectionRow> = {
  key: string;
  label: string;
  rows: TRow[];
};

export type ItemsListLocale = "en" | "ru";

function firstGrapheme(title: string): string {
  const t = title.trim();
  if (!t) {
    return "";
  }
  return [...t][0] ?? "";
}

function alphaGroupKeyAndLabel(title: string, locale: ItemsListLocale): { key: string; label: string } {
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

function formatYearMonthHeading(locale: ItemsListLocale, d: Date): string {
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

/** Group sorted rows into date (YYYY month) or alphabet sections — same rules as web items list. */
export function buildItemsListSections<TRow extends ItemsListSectionRow>(
  sorted: readonly TRow[],
  sort: ItemsListSort,
  locale: ItemsListLocale,
): ItemsListSection<TRow>[] {
  const isDate = sort === "date_asc" || sort === "date_desc";
  if (isDate) {
    const map = new Map<string, TRow[]>();
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

  const map = new Map<string, { label: string; rows: TRow[] }>();
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
