import { compareVersions, type SystemUpdateComponent } from "./visibility";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

export type UpdateOrderNotice = {
  minCoreVersion: string;
  /** Core version in this plan that meets the requirement. Null when it does not. */
  satisfiedBy: string | null;
};

export type OrderableUpdate = {
  component: SystemUpdateComponent;
  toVersion: string;
  minCoreVersion?: string | null;
};

/**
 * Core updates run before enterprise updates.
 * An enterprise package with `minCoreVersion` waits until the plan's core version meets it.
 */
export function planComponentUpdateOrder<T extends OrderableUpdate>(
  updates: readonly T[],
  currentCoreVersion: string,
): { order: T[]; notice: UpdateOrderNotice | null } {
  const selected = [...updates].sort(
    (left, right) => Number(left.component !== "okkey") - Number(right.component !== "okkey"),
  );
  const enterprise = selected.find((update) => update.component === "enterprise");
  const core = selected.find((update) => update.component === "okkey");
  const minCoreVersion = enterprise?.minCoreVersion?.trim() || null;
  if (!enterprise || !minCoreVersion || meetsMinimum(currentCoreVersion, minCoreVersion)) {
    return { order: selected, notice: null };
  }
  const coreAfter = core?.toVersion ?? currentCoreVersion;
  if (core && meetsMinimum(coreAfter, minCoreVersion)) {
    return { order: selected, notice: { minCoreVersion, satisfiedBy: coreAfter } };
  }
  return {
    order: selected.filter((update) => update.component !== "enterprise"),
    notice: { minCoreVersion, satisfiedBy: null },
  };
}

function meetsMinimum(current: string, minimum: string): boolean {
  if (!SEMVER.test(minimum.trim())) {
    return current.trim() === minimum.trim();
  }
  if (!SEMVER.test(current.trim())) {
    return false;
  }
  return compareVersions(current, minimum) >= 0;
}
