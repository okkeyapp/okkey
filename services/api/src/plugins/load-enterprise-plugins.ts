import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ApiConfig } from "../config.ts";
import type { ApiEnterprisePlugin } from "./types.ts";

type EnterprisePluginModule = {
  createEnterprisePlugins?: () => ApiEnterprisePlugin[] | Promise<ApiEnterprisePlugin[]>;
};

export type LoadEnterprisePluginsResult = {
  plugins: ApiEnterprisePlugin[];
  /**
   * True when the plugin entry imported successfully.
   * Does **not** mean optional-module entitlements are on; those require
   * `setEnterpriseLicenseVerified(true)` on the plugin context.
   */
  enterpriseModulesActive: boolean;
  /** Present when the plugin entry failed to import. */
  loadError?: string;
};

/**
 * Load enterprise backend plugins.
 * Fail closed: missing/unloadable sibling → no plugins.
 * `ENTERPRISE_MODULES` alone never enables entitlements; the plugin must
 * confirm a verified license after load.
 */
export async function loadEnterprisePlugins(
  config: ApiConfig,
): Promise<LoadEnterprisePluginsResult> {
  if (!config.enterpriseModulesEnabled) {
    return { plugins: [], enterpriseModulesActive: false };
  }

  const entryPath = path.join(config.enterpriseModulesPath, "backend/api-plugin/index.ts");
  try {
    const moduleUrl = pathToFileURL(entryPath).href;
    const loaded = (await import(moduleUrl)) as EnterprisePluginModule;
    const plugins = await loaded.createEnterprisePlugins?.();
    return {
      plugins: plugins ?? [],
      enterpriseModulesActive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      plugins: [],
      enterpriseModulesActive: false,
      loadError: message,
    };
  }
}
