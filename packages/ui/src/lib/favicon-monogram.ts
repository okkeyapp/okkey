/** Tailwind/shadcn 500 palette — monogram backgrounds and generic fallbacks. */
export const FAVICON_MONOGRAM_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
] as const;

const SHADCN_500_HEX = FAVICON_MONOGRAM_COLORS;

function stableIndexFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % SHADCN_500_HEX.length;
}

/** Up to two initials: first letters of the first two words, or the first two characters. */
export function deriveFaviconMonogram(name?: string, monogram?: string): string {
  const override = monogram?.trim();
  if (override) {
    return takeMonogramLetters(override);
  }
  return takeMonogramLetters(name ?? "");
}

function isAlphanumericChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

function firstAlphanumericChar(token: string): string {
  for (const ch of token) {
    if (isAlphanumericChar(ch)) {
      return ch;
    }
  }
  return "";
}

function firstAlphanumericChars(input: string, count: number): string {
  const out: string[] = [];
  for (const ch of input) {
    if (isAlphanumericChar(ch)) {
      out.push(ch);
      if (out.length >= count) {
        break;
      }
    }
  }
  return out.join("").toLocaleUpperCase();
}

function takeMonogramLetters(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length >= 2) {
    const first = firstAlphanumericChar(words[0] ?? "");
    const second = firstAlphanumericChar(words[1] ?? "");
    if (first && second) {
      return (first + second).toLocaleUpperCase();
    }
  }
  return firstAlphanumericChars(trimmed, 2);
}

/** Background for monogram tiles — hue bucket from the first letter (1Password-style). */
export function faviconMonogramBackgroundColor(monogram: string): string {
  const first = firstAlphanumericChar(monogram).toUpperCase();
  if (!first) {
    return SHADCN_500_HEX[0];
  }
  const code = first.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return SHADCN_500_HEX[(code - 65) % SHADCN_500_HEX.length] ?? SHADCN_500_HEX[0];
  }
  return SHADCN_500_HEX[stableIndexFromString(monogram)] ?? SHADCN_500_HEX[0];
}
