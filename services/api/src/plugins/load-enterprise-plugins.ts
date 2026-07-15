import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ApiConfig } from "../config.ts";
import type { ApiEnterprisePlugin } from "./types.ts";

type EnterprisePluginModule = {
  createEnterprisePlugins?: () => ApiEnterprisePlugin[] | Promise<ApiEnterprisePlugin[]>;
};

export async function loadEnterprisePlugins(config: ApiConfig): Promise<ApiEnterprisePlugin[]> {
  if (!config.enterpriseModulesEnabled) {
    return [];
  }

  const entryPath = path.join(config.enterpriseModulesPath, "backend/api-plugin/index.ts");
  const moduleUrl = pathToFileURL(entryPath).href;
  const loaded = (await import(moduleUrl)) as EnterprisePluginModule;
  const plugins = await loaded.createEnterprisePlugins?.();
  return plugins ?? [];
}
