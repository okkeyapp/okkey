import type { ApiConfig } from "../config.ts";
import { json, type RouteHandler } from "../http.ts";
import { resolveInstanceVersion } from "../version/resolve-instance-version.ts";

/**
 * POST /updates/apply — self-host only, orthogonal to licensing.
 *
 * Does **not** pull or apply packages from the API process (no docker.sock).
 * Until a signed update agent exists, always returns 501 UPDATE_APPLY_UNAVAILABLE
 * so the web modal can show a clear error without mutating the instance.
 */
export function createUpdatesApplyRouteHandler(config: ApiConfig): RouteHandler {
  return (ctx) => {
    const instance = resolveInstanceVersion({
      deploymentMode: config.deploymentMode,
      enterpriseModulesEnabled: config.enterpriseModulesEnabled,
      enterpriseModulesPath: config.enterpriseModulesPath,
    });

    if (config.deploymentMode !== "self_hosted") {
      json(ctx.res, 404, {
        error: "NOT_FOUND",
        message: "System updates apply is self-host only",
        requestId: ctx.requestId,
      });
      return;
    }

    json(ctx.res, 501, {
      error: "UPDATE_APPLY_UNAVAILABLE",
      message:
        "Update agent is not configured. Signed package verification is required before apply; the API does not use docker.sock.",
      requestId: ctx.requestId,
      time: new Date().toISOString(),
      deploymentMode: config.deploymentMode,
      current: {
        okkey: instance.okkey,
        enterprise: instance.enterprise,
      },
      applied: false,
    });
  };
}
