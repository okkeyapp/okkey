import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import { HttpRequestError, json, readJsonBody, type RouteHandler } from "../http.ts";
import { isSystemUpdateError } from "./errors.ts";
import type { UpdateComponent } from "./package-format.ts";
import type { SystemUpdateService } from "./service.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

export function registerSystemUpdateRoutes(
  route: (method: string, path: string, handler: RouteHandler) => void,
  config: Pick<ApiConfig, "deploymentMode">,
  service: SystemUpdateService,
  resolveUserId: ResolveUserId,
): void {
  route("GET", "/system/updates", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const status = await service.statusFor(userId);
      json(ctx.res, 200, status);
    } catch (error) {
      writeUpdateError(ctx, error);
    }
  });

  route("POST", "/system/updates/seen", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<{ component?: unknown; version?: unknown }>(ctx.req);
      const component = parseComponent(body.component);
      const version = typeof body.version === "string" ? body.version.trim() : "";
      if (!version || version.length > 80) {
        throw new HttpRequestError(400, "PACKAGE_INVALID", "version is required");
      }
      await service.markSeen(userId, component, version);
      json(ctx.res, 200, { ok: true });
    } catch (error) {
      writeUpdateError(ctx, error);
    }
  });

  route("POST", "/system/updates/dismiss", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<{ component?: unknown; version?: unknown }>(ctx.req);
      const component = parseComponent(body.component);
      const version = typeof body.version === "string" ? body.version.trim() : "";
      if (!version || version.length > 80) {
        throw new HttpRequestError(400, "PACKAGE_INVALID", "version is required");
      }
      await service.dismiss(userId, component, version);
      json(ctx.res, 200, { ok: true });
    } catch (error) {
      writeUpdateError(ctx, error);
    }
  });

  route("POST", "/system/updates/apply", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<{
        source?: unknown;
        component?: unknown;
        document?: unknown;
      }>(ctx.req);
      if (body.source !== "feed" && body.source !== "file") {
        throw new HttpRequestError(400, "PACKAGE_INVALID", "source must be feed or file");
      }
      const job = await service.apply(userId, {
        source: body.source,
        component: body.component === undefined ? undefined : parseComponent(body.component),
        document: body.document,
      });
      json(ctx.res, 202, { job });
    } catch (error) {
      writeUpdateError(ctx, error);
    }
  });

  route("GET", "/system/updates/jobs/:jobId", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    if (!(await service.userCanApply(userId))) {
      json(ctx.res, 403, errorBody("NOT_ADMIN", "Only a workspace owner can read update jobs", ctx.requestId));
      return;
    }
    const jobId = ctx.params.jobId ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      json(ctx.res, 400, errorBody("PACKAGE_INVALID", "job id is invalid", ctx.requestId));
      return;
    }
    try {
      const job = await service.job(jobId);
      if (!job) {
        json(ctx.res, 404, errorBody("NOT_FOUND", "Update job not found", ctx.requestId));
        return;
      }
      json(ctx.res, 200, { job });
    } catch (error) {
      writeUpdateError(ctx, error);
    }
  });
}

function hideInSaas(
  config: Pick<ApiConfig, "deploymentMode">,
  ctx: Parameters<RouteHandler>[0],
): boolean {
  if (config.deploymentMode !== "saas") {
    return false;
  }
  json(ctx.res, 404, errorBody("NOT_FOUND", "Route not found", ctx.requestId));
  return true;
}

function parseComponent(value: unknown): UpdateComponent {
  if (value === "okkey" || value === "enterprise") {
    return value;
  }
  throw new HttpRequestError(400, "PACKAGE_INVALID", "component must be okkey or enterprise");
}

function writeUpdateError(ctx: Parameters<RouteHandler>[0], error: unknown): void {
  if (error instanceof HttpRequestError) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  if (isSystemUpdateError(error)) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  throw error;
}

function errorBody(error: string, message: string, requestId: string) {
  return { error, message, requestId };
}
