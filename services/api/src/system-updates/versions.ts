export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(value: string): ParsedVersion | null {
  const match = SEMVER.exec(value.trim());
  if (!match) {
    return null;
  }
  const prerelease = match[4] ? match[4].split(".") : [];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
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

/**
 * Compare two version strings.
 * SemVer (including prerelease) uses numeric order. Anything else is equal only
 * when the strings match, so a new feed value shows again after dismiss.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return left === right ? 0 : 1;
  }
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) {
    return 0;
  }
  if (a.prerelease.length === 0) {
    return 1;
  }
  if (b.prerelease.length === 0) {
    return -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aId = a.prerelease[index];
    const bId = b.prerelease[index];
    if (aId === undefined) {
      return -1;
    }
    if (bId === undefined) {
      return 1;
    }
    const compared = compareIdentifiers(aId, bId);
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
}

/** True when `available` is newer than the version an admin dismissed. */
export function shouldShowUpdate(available: string, dismissed: string | null | undefined): boolean {
  if (!dismissed) {
    return true;
  }
  return compareVersions(available, dismissed) > 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!current || current === "unknown") {
    return true;
  }
  return compareVersions(candidate, current) > 0;
}
