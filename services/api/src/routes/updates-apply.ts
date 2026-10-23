import type { ApiConfig } from "../config.ts";
import { json, type RouteHandler } from "../http.ts";
import { applySystemUpdates } from "../updates/apply-update.ts";
import { resolveInstanceVersion } from "../version/resolve-instance-version.ts";

/**
 * POST /updates/apply — self-host only, orthogonal to licensing.
 *
 * Does **not** mount docker.sock in the API process. Apply runs via:
 * - `OKKEY_UPDATE_APPLY_MODE=agent` → signed update agent URL
 * - `hook` → host script (compose pull / restart)
 * - `version_file` → local smoke: write `OKKEY_VERSION_FILE` so GET /version advances
 * - unset/`off` → 501 UPDATE_APPLY_UNAVAILABLE
 */
export function createUpdatesApplyRouteHandler(config: ApiConfig): RouteHandler {
  return async (ctx) => {
    if (config.deploymentMode !== "self_hosted") {
      json(ctx.res, 404, {
        error: "NOT_FOUND",
        message: "System updates apply is self-host only",
        requestId: ctx.requestId,
      });
      return;
    }

    const result = await applySystemUpdates(config);
    if (result.ok) {
      json(ctx.res, 200, {
        applied: true,
        mode: result.mode,
        current: result.current,
        requestId: ctx.requestId,
        time: new Date().toISOString(),
        deploymentMode: config.deploymentMode,
      });
      return;
    }

    json(ctx.res, result.status, {
      error: result.error,
      message: result.message,
      applied: false,
      requestId: ctx.requestId,
      time: new Date().toISOString(),
      deploymentMode: config.deploymentMode,
      current: result.current,
    });
  };
}

/** Resolve current versions for error payloads when apply short-circuits. */
export function resolveApplyCurrent(config: ApiConfig) {
  return resolveInstanceVersion({
    deploymentMode: config.deploymentMode,
    enterpriseModulesEnabled: config.enterpriseModulesEnabled,
    enterpriseModulesPath: config.enterpriseModulesPath,
    versionFilePath: config.updateVersionFilePath || null,
  });
}
