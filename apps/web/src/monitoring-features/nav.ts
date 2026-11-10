type NavRow = { id: string };

/**
 * Path for the monitoring route and sidebar row.
 * Present whenever the module slot provides `monitoringPath`.
 * A missing plan feature does not hide it; the module page is read-only in that case.
 */
export function visiblePasswordMonitoringPath(monitoringPath: string | null): string | null {
  if (monitoringPath == null || monitoringPath === "") {
    return null;
  }
  return monitoringPath;
}

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
