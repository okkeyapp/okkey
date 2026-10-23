import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentMode } from "../config.ts";

/**
 * Product UI / release string for this release track when root `package.json` is still
 * the npm placeholder (`0.0.0` / `0.0.1`) or no other source is set.
 * Scheme (spelling **betta**): main=`1.0.0-betta.1`, dev=`1.0.0-betta.2`, this track=`1.0.0-betta.3` → stable `1.0.0`.
 * Sidebar shows `Okkey v1.0.0-betta.3`.
 */
export const DEFAULT_PRODUCT_VERSION = "1.0.0-betta.3";

/** npm / workspace placeholders that must not surface in the self-host plaque. */
const PLACEHOLDER_PACKAGE_VERSIONS = new Set(["0.0.0", "0.0.1"]);

export type InstanceVersionPayload = {
  okkey: string;
  /** Present when enterprise modules are enabled and a version can be resolved. */
  enterprise: string | null;
  deploymentMode: DeploymentMode;
  enterpriseModulesEnabled: boolean;
};

export type VersionFileContents = {
  okkey: string | null;
  enterprise: string | null;
};

export type ResolveInstanceVersionInput = {
  deploymentMode: DeploymentMode;
  enterpriseModulesEnabled: boolean;
  enterpriseModulesPath: string;
  env?: NodeJS.ProcessEnv;
  /** Override Core package.json path (tests). */
  corePackageJsonPath?: string;
  /** Override enterprise package.json path (tests). */
  enterprisePackageJsonPath?: string;
  /** Override version-file path (tests); else `OKKEY_VERSION_FILE`. */
  versionFilePath?: string | null;
};

function readPackageVersion(packageJsonPath: string): string | null {
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim() !== "") {
      return parsed.version.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/** Skip npm placeholders so the plaque does not show `Okkey v0.0.1`. */
export function productVersionFromPackageJson(packageJsonPath: string): string | null {
  const version = readPackageVersion(packageJsonPath);
  if (!version || PLACEHOLDER_PACKAGE_VERSIONS.has(version)) {
    return null;
  }
  return version;
}

function firstNonEmpty(...candidates: Array<string | undefined | null>): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Image tags like `dev` / `latest` / digests are not product versions for the sidebar plaque.
 * Accept dotted cores and Okkey prereleases: `1.0.0`, `1.0.0-betta.3` (optional leading `v`).
 */
export function isProductVersionString(value: string | undefined | null): boolean {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return false;
  }
  const v = trimmed.replace(/^v/i, "");
  return /^\d+(?:\.\d+)*(?:-[A-Za-z]+\.\d+)?$/.test(v);
}

/** Default Core `package.json` relative to this module (`services/api/src/version`). */
export function defaultCorePackageJsonPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../package.json");
}

export function readVersionFile(versionFilePath: string): VersionFileContents | null {
  if (!versionFilePath.trim() || !existsSync(versionFilePath)) {
    return null;
  }
  try {
    const raw = readFileSync(versionFilePath, "utf8");
    const parsed = JSON.parse(raw) as { okkey?: unknown; enterprise?: unknown };
    const okkey =
      typeof parsed.okkey === "string" && parsed.okkey.trim() !== ""
        ? parsed.okkey.trim()
        : null;
    const enterprise =
      typeof parsed.enterprise === "string" && parsed.enterprise.trim() !== ""
        ? parsed.enterprise.trim()
        : null;
    if (!okkey && !enterprise) {
      return null;
    }
    return { okkey, enterprise };
  } catch {
    return null;
  }
}

/**
 * Resolve the product build/version string shown in self-host UI.
 *
 * Priority for Core (`okkey`):
 * 1. `OKKEY_VERSION` / `APP_VERSION`
 * 2. `OKKEY_VERSION_FILE` JSON `{ okkey }` (written by local/dev apply)
 * 3. Core `package.json` when not `0.0.0`/`0.0.1`
 * 4. Product-like `OKKEY_IMAGE_TAG` (semver only; `dev` skipped)
 * 5. {@link DEFAULT_PRODUCT_VERSION} (`1.0.0-betta.3`)
 *
 * Enterprise (when modules on): `OKKEY_ENTERPRISE_VERSION` → version file → sibling package.json
 * → same display string as Core (versions coincide for product UI).
 */
export function resolveInstanceVersion(input: ResolveInstanceVersionInput): InstanceVersionPayload {
  const env = input.env ?? process.env;
  const corePackageJsonPath = input.corePackageJsonPath ?? defaultCorePackageJsonPath();
  const versionFilePath =
    input.versionFilePath !== undefined
      ? (input.versionFilePath ?? "")
      : (env.OKKEY_VERSION_FILE ?? "").trim();
  const fromFile = versionFilePath ? readVersionFile(versionFilePath) : null;
  const imageTag = env.OKKEY_IMAGE_TAG?.trim();

  const okkey =
    firstNonEmpty(env.OKKEY_VERSION, env.APP_VERSION) ??
    fromFile?.okkey ??
    productVersionFromPackageJson(corePackageJsonPath) ??
    (isProductVersionString(imageTag) ? imageTag! : null) ??
    DEFAULT_PRODUCT_VERSION;

  let enterprise: string | null = null;
  if (input.enterpriseModulesEnabled) {
    const enterprisePackageJsonPath =
      input.enterprisePackageJsonPath ??
      path.join(input.enterpriseModulesPath, "package.json");
    enterprise =
      firstNonEmpty(env.OKKEY_ENTERPRISE_VERSION) ??
      fromFile?.enterprise ??
      productVersionFromPackageJson(enterprisePackageJsonPath) ??
      // Product display coincides: EE sibling uses the same release string when present.
      okkey;
  }

  return {
    okkey,
    enterprise,
    deploymentMode: input.deploymentMode,
    enterpriseModulesEnabled: input.enterpriseModulesEnabled,
  };
}
