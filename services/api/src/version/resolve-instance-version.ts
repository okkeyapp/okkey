import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeploymentMode } from "../config.ts";

export type InstanceVersionPayload = {
  okkey: string;
  /** Present when enterprise modules are enabled and a version can be resolved. */
  enterprise: string | null;
  deploymentMode: DeploymentMode;
  enterpriseModulesEnabled: boolean;
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

function firstNonEmpty(...candidates: Array<string | undefined | null>): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

/** Default Core `package.json` relative to this module (`services/api/src/version`). */
export function defaultCorePackageJsonPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../package.json");
}

/**
 * Resolve the product build/version string shown in self-host UI.
 * Priority: `OKKEY_VERSION` → `APP_VERSION` → `OKKEY_IMAGE_TAG` → Core `package.json` → `"unknown"`.
 */
export function resolveInstanceVersion(input: ResolveInstanceVersionInput): InstanceVersionPayload {
  const env = input.env ?? process.env;
  const corePackageJsonPath = input.corePackageJsonPath ?? defaultCorePackageJsonPath();
  const okkey =
    firstNonEmpty(env.OKKEY_VERSION, env.APP_VERSION, env.OKKEY_IMAGE_TAG) ??
    readPackageVersion(corePackageJsonPath) ??
    "unknown";

  let enterprise: string | null = null;
  if (input.enterpriseModulesEnabled) {
    const enterprisePackageJsonPath =
      input.enterprisePackageJsonPath ??
      path.join(input.enterpriseModulesPath, "package.json");
    enterprise =
      firstNonEmpty(env.OKKEY_ENTERPRISE_VERSION) ??
      readPackageVersion(enterprisePackageJsonPath);
  }

  return {
    okkey,
    enterprise,
    deploymentMode: input.deploymentMode,
    enterpriseModulesEnabled: input.enterpriseModulesEnabled,
  };
}
