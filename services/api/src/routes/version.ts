import type { ApiConfig } from "../config.ts";
import { json, type RouteHandler } from "../http.ts";
import { resolveInstanceVersion } from "../version/resolve-instance-version.ts";

export function createVersionRouteHandler(config: ApiConfig): RouteHandler {
  return async (ctx) => {
    const payload = resolveInstanceVersion({
      deploymentMode: config.deploymentMode,
      enterpriseModulesEnabled: config.enterpriseModulesEnabled,
      enterpriseModulesPath: config.enterpriseModulesPath,
      versionFilePath: config.updateVersionFilePath || null,
    });
    json(ctx.res, 200, {
      ...payload,
      requestId: ctx.requestId,
      time: new Date().toISOString(),
    });
  };
}
