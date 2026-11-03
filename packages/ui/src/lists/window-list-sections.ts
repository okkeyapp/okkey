/**
 * Keeps section headings while revealing only the first `visibleCount` rows
 * across the ordered section list (filter/sort already applied).
 */
export function windowListSections<TRow, TSection extends { rows: readonly TRow[] }>(
  sections: readonly TSection[],
  visibleCount: number,
): TSection[] {
  const limit = Math.max(0, visibleCount);
  if (limit === 0) {
    return [];
  }

  let remaining = limit;
  const out: TSection[] = [];

  for (const section of sections) {
    if (remaining <= 0) {
      break;
    }
    if (section.rows.length <= remaining) {
      out.push(section);
      remaining -= section.rows.length;
      continue;
    }
    out.push({
      ...section,
      rows: section.rows.slice(0, remaining),
    });
    remaining = 0;
  }

  return out;
}
