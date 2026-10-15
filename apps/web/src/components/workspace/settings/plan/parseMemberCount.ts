/**
 * Accepts only a plain positive integer string (digits only, >= 1).
 * Keeps raw input as typed — never strip `-` / `.` / `e` into a different number.
 */
export function parseMemberCount(raw: string): number | null {
  const trimmed = raw.trim();
  // Reject scientific notation, decimals, signs, and other non-digit text.
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}
