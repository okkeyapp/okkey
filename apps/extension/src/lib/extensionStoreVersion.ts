/**
 * Product SemVer → Chrome / Edge / AMO manifest version (four integers).
 *
 *   X.Y.Z-beta.N → X.Y.Z.N         (N in 1..99)
 *   X.Y.Z-rc.N   → X.Y.Z.(100+N)   (N in 1..99)
 *   X.Y.Z        → X.Y.Z.1000
 *
 * Dev/local builds (root product version is the dev sentinel, and
 * OKKEY_EXTENSION_STORE_RELEASE is unset) use 0.0.0.<counter>, which must
 * stay strictly below the last submitted store version. Store packaging
 * sets OKKEY_EXTENSION_STORE_RELEASE=1, or a release checkout bumps the
 * root product version off the dev sentinel. That path computes the fourth
 * component from the release product SemVer and requires it to be strictly
 * greater than the floor.
 */

export const DEV_PRODUCT_VERSION = "0.0.1";
export const STORE_RELEASE_ENV = "OKKEY_EXTENSION_STORE_RELEASE";
export const PRODUCT_VERSION_ENV = "OKKEY_PRODUCT_VERSION";
export const DEV_BUILD_ENV = "OKKEY_EXTENSION_DEV_BUILD";

const MAX_COMPONENT = 65535;
const MAX_PRERELEASE = 99;
const STABLE_FOURTH = 1000;
const RC_FOURTH_OFFSET = 100;

const PRODUCT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|rc)\.([1-9]\d*))?$/;
const STORE_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class ExtensionStoreVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionStoreVersionError";
  }
}

export type StoreVersionParts = [number, number, number, number];

export type ResolveExtensionManifestVersionInput = {
  rootVersion: string;
  extensionPackageVersion: string;
  /** Value of OKKEY_EXTENSION_STORE_RELEASE. Only "1" selects the store path. */
  storeReleaseEnv?: string;
  /** Value of OKKEY_PRODUCT_VERSION. Explicit release SemVer. */
  productVersionEnv?: string;
  /** Value of OKKEY_EXTENSION_DEV_BUILD. Fourth component for dev builds. */
  devBuildCounterEnv?: string;
  /** Last submitted store manifest version (four integers). */
  floor: string;
};

export type ResolvedExtensionManifestVersion = {
  mode: "dev" | "release";
  manifestVersion: string;
  productSemver: string | null;
};

function component(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COMPONENT) {
    throw new ExtensionStoreVersionError(
      `${label} ${raw} is outside 0..${MAX_COMPONENT}.`,
    );
  }
  return value;
}

export function productSemverToStoreVersion(semver: string): string {
  const trimmed = semver.trim();
  const match = PRODUCT_SEMVER.exec(trimmed);
  if (!match) {
    throw new ExtensionStoreVersionError(
      `Unsupported product SemVer "${trimmed}". Expected X.Y.Z, X.Y.Z-beta.N, or X.Y.Z-rc.N with N in 1..${MAX_PRERELEASE}.`,
    );
  }
  const major = component(match[1], "Major");
  const minor = component(match[2], "Minor");
  const patch = component(match[3], "Patch");
  const channel = match[4];
  let fourth: number;
  if (channel === undefined) {
    fourth = STABLE_FOURTH;
  } else {
    const pre = component(match[5], "Pre-release");
    if (pre < 1 || pre > MAX_PRERELEASE) {
      throw new ExtensionStoreVersionError(
        `Pre-release number must be in 1..${MAX_PRERELEASE}, got ${pre}.`,
      );
    }
    fourth = channel === "beta" ? pre : RC_FOURTH_OFFSET + pre;
  }
  if (fourth > MAX_COMPONENT) {
    throw new ExtensionStoreVersionError(
      `Store version component ${fourth} is outside 0..${MAX_COMPONENT}.`,
    );
  }
  return `${major}.${minor}.${patch}.${fourth}`;
}

export function parseStoreVersion(version: string): StoreVersionParts {
  const trimmed = version.trim();
  const match = STORE_VERSION.exec(trimmed);
  if (!match) {
    throw new ExtensionStoreVersionError(
      `Invalid store manifest version "${trimmed}". Expected four integers in 0..${MAX_COMPONENT}.`,
    );
  }
  return [
    component(match[1], "Major"),
    component(match[2], "Minor"),
    component(match[3], "Patch"),
    component(match[4], "Store"),
  ];
}

/** Negative when `left` < `right`, zero when equal, positive when `left` > `right`. */
export function compareStoreVersions(left: string, right: string): number {
  const a = parseStoreVersion(left);
  const b = parseStoreVersion(right);
  for (let i = 0; i < 4; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function assertStoreVersionAboveFloor(storeVersion: string, floor: string): void {
  if (compareStoreVersions(storeVersion, floor) <= 0) {
    throw new ExtensionStoreVersionError(
      `Store manifest version ${storeVersion} must be greater than the last submitted version ${floor}.`,
    );
  }
}

export function parseLastSubmittedStoreVersion(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length !== 1) {
    throw new ExtensionStoreVersionError(
      "Last-submitted store version file must contain exactly one version.",
    );
  }
  parseStoreVersion(lines[0]);
  return lines[0];
}

function parseDevBuildCounter(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const value = raw.trim();
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ExtensionStoreVersionError(
      `${DEV_BUILD_ENV} must be an integer in 0..${MAX_COMPONENT}, got "${value}".`,
    );
  }
  return component(value, DEV_BUILD_ENV);
}

function isStoreReleaseFlag(value: string | undefined): boolean {
  return value?.trim() === "1";
}

export function resolveExtensionManifestVersion(
  input: ResolveExtensionManifestVersionInput,
): ResolvedExtensionManifestVersion {
  const rootVersion = input.rootVersion.trim();
  const extensionPackageVersion = input.extensionPackageVersion.trim();
  const productOverride = input.productVersionEnv?.trim() ?? "";
  const explicitRelease = isStoreReleaseFlag(input.storeReleaseEnv);
  const rootIsDevSentinel = rootVersion === DEV_PRODUCT_VERSION;
  const release = explicitRelease || !rootIsDevSentinel;

  if (!release) {
    if (productOverride !== "") {
      throw new ExtensionStoreVersionError(
        `${PRODUCT_VERSION_ENV} is set but this is a dev build. Set ${STORE_RELEASE_ENV}=1 to package a store build.`,
      );
    }
    const counter = parseDevBuildCounter(input.devBuildCounterEnv);
    const manifestVersion = `0.0.0.${counter}`;
    if (compareStoreVersions(manifestVersion, input.floor) >= 0) {
      throw new ExtensionStoreVersionError(
        `Dev manifest version ${manifestVersion} is not strictly below the store floor ${input.floor.trim()}.`,
      );
    }
    return { mode: "dev", manifestVersion, productSemver: null };
  }

  const productSemver = productOverride !== "" ? productOverride : rootVersion;
  if (productSemver === DEV_PRODUCT_VERSION) {
    throw new ExtensionStoreVersionError(
      `Refusing a store manifest from product version ${DEV_PRODUCT_VERSION}. Dev builds use 0.0.0.<counter>. Set ${PRODUCT_VERSION_ENV} to the release SemVer and set apps/extension/package.json to that same SemVer.`,
    );
  }
  if (!rootIsDevSentinel && rootVersion !== productSemver) {
    throw new ExtensionStoreVersionError(
      `Root package.json version ${rootVersion} does not match the release product SemVer ${productSemver}.`,
    );
  }
  if (extensionPackageVersion !== productSemver) {
    throw new ExtensionStoreVersionError(
      `apps/extension/package.json version ${extensionPackageVersion} must equal the release product SemVer ${productSemver}.`,
    );
  }

  const manifestVersion = productSemverToStoreVersion(productSemver);
  assertStoreVersionAboveFloor(manifestVersion, input.floor);
  return { mode: "release", manifestVersion, productSemver };
}
