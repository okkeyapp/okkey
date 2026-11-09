type NavRow = { id: string };

/**
 * Insert a password-monitoring nav row after capsules (`id: "cap"`).
 * A null contribution removes any leftover `mon` row.
 */
export function mergePasswordMonitoringNavItem<T extends NavRow>(
  items: readonly T[],
  contribution: T | null,
): T[] {
  if (!contribution) {
    return items.filter((item) => item.id !== "mon");
  }
  const without = items.filter((item) => item.id !== contribution.id && item.id !== "mon");
  const capsulesIndex = without.findIndex((item) => item.id === "cap");
  const next = [...without];
  const insertAt = capsulesIndex >= 0 ? capsulesIndex + 1 : without.length;
  next.splice(insertAt, 0, contribution);
  return next;
}
