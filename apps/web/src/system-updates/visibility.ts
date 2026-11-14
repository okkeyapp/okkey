/**
 * Client-side dismiss rule. Same comparison as services/api/src/system-updates/versions.ts:
 * a notice stays hidden until the feed offers a newer version than the one that was dismissed.
 */

export type SystemUpdateComponent = "okkey" | "enterprise";

export type SystemUpdateAvailable = {
  component: SystemUpdateComponent;
  fromVersion: string;
  toVersion: string;
  summary: string;
  releasedAt: string;
  source: "feed";
  minCoreVersion?: string | null;
  releaseNotesUrl?: string | null;
};

export type SystemUpdateCheckError = "FEED_FETCH_FAILED" | "FEED_INVALID";

export type SystemUpdateComponentStatus = {
  component: SystemUpdateComponent;
  installedVersion: string;
  update: SystemUpdateAvailable | null;
  checkError: SystemUpdateCheckError | null;
  feedConfigured: boolean;
  minCoreVersion: string | null;
  releaseNotesUrl: string | null;
};

export type SystemUpdateStatus = {
  deploymentMode: "self_hosted" | "saas";
  currentVersion: string;
  /** Full git commit for a dev build. Null on a tagged release. */
  commitSha: string | null;
  /** Git tag such as `v1.0.0-beta.3` when this build was cut from a tag. */
  releaseTag: string | null;
  enterpriseInstalled: boolean;
  enterpriseVersion: string | null;
  feedConfigured: boolean;
  isolated: boolean;
  canApply: boolean;
  updates: SystemUpdateAvailable[];
  /** Present when the API reports one row per component. */
  components?: readonly SystemUpdateComponentStatus[];
  dismissed: Partial<Record<SystemUpdateComponent, string>>;
  /** Last feed version opened in the system-update popup, per component. */
  seen: Partial<Record<SystemUpdateComponent, string>>;
  offlineArchiveSupported?: boolean;
  feedError: string | null;
  /** Combined archives are applied only after the API can read them. */
  offlineArchiveSupported?: boolean;
};

export type SystemUpdateJob = {
  id: string;
  status: "verifying" | "downloading" | "applying" | "succeeded" | "failed";
  progress: number;
  component: SystemUpdateComponent;
  fromVersion: string;
  toVersion: string;
  errorCode?: string;
  errorMessage?: string;
  components?: Array<{
    component: SystemUpdateComponent;
    version: string;
    applied: boolean;
  }>;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const STORAGE_KEY = "okkey.systemUpdate.dismissed";
const SEEN_STORAGE_KEY = "okkey.systemUpdate.seen";

function parseVersion(value: string): ParsedVersion | null {
  const match = SEMVER.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNum = /^\d+$/.test(left);
  const rightNum = /^\d+$/.test(right);
  if (leftNum && rightNum) {
    return Number(left) - Number(right);
  }
  if (leftNum) {
    return -1;
  }
  if (rightNum) {
    return 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return left === right ? 0 : 1;
  }
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aId = a.prerelease[index];
    const bId = b.prerelease[index];
    if (aId === undefined) return -1;
    if (bId === undefined) return 1;
    const compared = compareIdentifiers(aId, bId);
    if (compared !== 0) return compared;
  }
  return 0;
}

export function shouldShowUpdate(available: string, dismissed: string | null | undefined): boolean {
  if (!dismissed) {
    return true;
  }
  return compareVersions(available, dismissed) > 0;
}

export function visibleUpdates(
  updates: readonly SystemUpdateAvailable[],
  dismissed: Partial<Record<SystemUpdateComponent, string>>,
  localDismissed: Partial<Record<SystemUpdateComponent, string>>,
): SystemUpdateAvailable[] {
  return updates.filter(
    (update) =>
      shouldShowUpdate(update.toVersion, dismissed[update.component]) &&
      shouldShowUpdate(update.toVersion, localDismissed[update.component]),
  );
}

/** Yellow dot: a feed version newer than the last one opened in the popup. */
export function shouldShowVersionDot(
  updates: readonly { component: SystemUpdateComponent; toVersion: string }[],
  seen: Partial<Record<SystemUpdateComponent, string>>,
  localSeen: Partial<Record<SystemUpdateComponent, string>> = {},
): boolean {
  return updates.some(
    (update) =>
      shouldShowUpdate(update.toVersion, seen[update.component]) &&
      shouldShowUpdate(update.toVersion, localSeen[update.component]),
  );
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalDismissals(): Partial<Record<SystemUpdateComponent, string>> {
  return readComponentMap(STORAGE_KEY);
}

export function writeLocalDismissal(component: SystemUpdateComponent, version: string): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  const next = { ...readLocalDismissals(), [component]: version };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function readLocalSeen(): Partial<Record<SystemUpdateComponent, string>> {
  return readComponentMap(SEEN_STORAGE_KEY);
}

/** Remember a seen feed version. An older value does not replace a newer one. */
export function writeLocalSeen(component: SystemUpdateComponent, version: string): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }
  const current = readLocalSeen();
  const previous = current[component];
  if (previous && compareVersions(version, previous) <= 0) {
    return;
  }
  storage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ ...current, [component]: version }));
}

function readComponentMap(key: string): Partial<Record<SystemUpdateComponent, string>> {
  const storage = browserStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Partial<Record<SystemUpdateComponent, string>> = {};
    for (const component of ["okkey", "enterprise"] as const) {
      const value = (parsed as Record<string, unknown>)[component];
      if (typeof value === "string" && value.trim()) {
        result[component] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}
