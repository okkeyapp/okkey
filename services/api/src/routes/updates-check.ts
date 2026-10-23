import type { ApiConfig } from "../config.ts";
import { json, type RouteHandler } from "../http.ts";
import { diffAvailableUpdates } from "../updates/feed-contract.ts";
import {
  isUpdateFeedConfigured,
  loadUpdateFeedDocument,
} from "../updates/load-update-feed.ts";
import { resolveInstanceVersion } from "../version/resolve-instance-version.ts";

function readPlanTierQuery(reqUrl: string | undefined): string | null {
  try {
    const requestUrl = new URL(reqUrl ?? "/", "http://localhost");
    const raw = requestUrl.searchParams.get("planTier")?.trim() ?? "";
    return raw === "" ? null : raw;
  } catch {
    return null;
  }
}

/**
 * GET /updates/check — public, orthogonal to licensing.
 * SaaS always returns available=[]; self-host reads configured feed URL/path.
 * Optional `?planTier=` gates which feed components are considered
 * (FREE → okkey only; ENTERPRISE → okkey + okkey-enterprise).
 */
export function createUpdatesCheckRouteHandler(config: ApiConfig): RouteHandler {
  return async (ctx) => {
    const instance = resolveInstanceVersion({
      deploymentMode: config.deploymentMode,
      enterpriseModulesEnabled: config.enterpriseModulesEnabled,
      enterpriseModulesPath: config.enterpriseModulesPath,
      versionFilePath: config.updateVersionFilePath || null,
    });
    const planTier = readPlanTierQuery(ctx.req.url);

    const source = {
      url: config.updateFeedUrl ?? "",
      path: config.updateFeedPath ?? "",
      timeoutMs: config.updateFeedTimeoutMs ?? 5000,
    };
    const feedConfigured = isUpdateFeedConfigured(source);

    if (config.deploymentMode !== "self_hosted" || !feedConfigured) {
      const payload = diffAvailableUpdates({
        deploymentMode: config.deploymentMode,
        feedConfigured,
        currentOkkey: instance.okkey,
        currentEnterprise: instance.enterprise,
        feed: null,
        planTier,
      });
      json(ctx.res, 200, {
        ...payload,
        requestId: ctx.requestId,
        time: new Date().toISOString(),
      });
      return;
    }

    try {
      const feed = await loadUpdateFeedDocument(source);
      const payload = diffAvailableUpdates({
        deploymentMode: config.deploymentMode,
        feedConfigured: true,
        currentOkkey: instance.okkey,
        currentEnterprise: instance.enterprise,
        feed,
        planTier,
      });
      json(ctx.res, 200, {
        ...payload,
        requestId: ctx.requestId,
        time: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPDATE_FEED_ERROR";
      json(ctx.res, 502, {
        error: "UPDATE_FEED_UNAVAILABLE",
        message,
        requestId: ctx.requestId,
        deploymentMode: config.deploymentMode,
        feedConfigured: true,
        current: {
          okkey: instance.okkey,
          enterprise: instance.enterprise,
        },
        available: [],
      });
    }
  };
}
