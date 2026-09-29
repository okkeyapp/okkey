export type ItemsListSearchableRecord = {
  title: string;
  urls: readonly string[];
  tags?: readonly string[];
};

export function formatTagSearchQuery(tag: string): string {
  return `#${tag}`;
}

export function parseTagSearchNeedle(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith("#")) {
    return null;
  }
  const tag = trimmed.slice(1).trim();
  return tag.length > 0 ? tag : null;
}

export function itemRecordMatchesTagSearch(tags: readonly string[], tagNeedle: string): boolean {
  const needle = tagNeedle.trim().toLocaleLowerCase();
  if (!needle) {
    return false;
  }
  return tags.some((tag) => tag.toLocaleLowerCase() === needle);
}

/** Title weight 10; each URL index `i` contributes `10 / (i + 1)` if substring matches. */
export function scoreItemsListRecordSearch(row: ItemsListSearchableRecord, needle: string): number {
  const trimmed = needle.trim();
  if (!trimmed) {
    return 0;
  }

  const tagNeedle = parseTagSearchNeedle(trimmed);
  if (tagNeedle !== null) {
    return itemRecordMatchesTagSearch(row.tags ?? [], tagNeedle) ? 10 : 0;
  }

  const q = trimmed.toLowerCase();
  let score = 0;
  if (row.title.toLowerCase().includes(q)) {
    score += 10;
  }
  row.urls.forEach((url, index) => {
    if (url.toLowerCase().includes(q)) {
      score += 10 / (index + 1);
    }
  });
  return score;
}
