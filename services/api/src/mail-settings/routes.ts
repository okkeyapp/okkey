import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import { HttpRequestError, json, readJsonBody, type RouteHandler } from "../http.ts";
import { isEntityId } from "../entity-id.ts";
import { MailSettingsError, type MailSettingsService } from "./service.ts";
import type { ServerMailSettingsPatch, ServerMailSettingsPublic, SmtpTlsMode } from "./types.ts";

type ResolveUserId = (req: IncomingMessage) => Promise<string | null>;

type MailSettingsBody = {
  smtp_host?: unknown;
  smtp_port?: unknown;
  smtp_tls_mode?: unknown;
  smtp_username?: unknown;
  email_from?: unknown;
  public_app_url?: unknown;
  password?: unknown;
  clear_password?: unknown;
};

export function registerServerMailSettingsRoutes(
  route: (method: string, path: string, handler: RouteHandler) => void,
  config: Pick<ApiConfig, "deploymentMode">,
  service: MailSettingsService,
  resolveUserId: ResolveUserId,
): void {
  route("GET", "/workspaces/:workspaceId/server-mail-settings", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const workspaceId = ctx.params.workspaceId ?? "";
    if (!isEntityId(workspaceId)) {
      json(ctx.res, 400, errorBody("INVALID_WORKSPACE_ID", "workspace id is invalid", ctx.requestId));
      return;
    }
    try {
      const settings = await service.getForOwner(workspaceId, userId);
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeError(ctx, error);
    }
  });

  route("PATCH", "/workspaces/:workspaceId/server-mail-settings", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const workspaceId = ctx.params.workspaceId ?? "";
    if (!isEntityId(workspaceId)) {
      json(ctx.res, 400, errorBody("INVALID_WORKSPACE_ID", "workspace id is invalid", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<MailSettingsBody>(ctx.req);
      const settings = await service.updateForOwner(workspaceId, userId, patchFromBody(body));
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeError(ctx, error);
    }
  });

  route("POST", "/workspaces/:workspaceId/server-mail-settings/test-email", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorBody("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    const workspaceId = ctx.params.workspaceId ?? "";
    if (!isEntityId(workspaceId)) {
      json(ctx.res, 400, errorBody("INVALID_WORKSPACE_ID", "workspace id is invalid", ctx.requestId));
      return;
    }
    try {
      const body = await readJsonBody<MailSettingsBody>(ctx.req);
      await service.sendTestEmail(workspaceId, userId, patchFromBody(body));
      json(ctx.res, 200, { ok: true });
    } catch (error) {
      writeError(ctx, error);
    }
  });
}

export function serializeSettings(settings: ServerMailSettingsPublic) {
  return {
    smtp_host: settings.smtpHost,
    smtp_port: settings.smtpPort,
    smtp_tls_mode: settings.smtpTlsMode,
    smtp_username: settings.smtpUsername,
    email_from: settings.emailFrom,
    public_app_url: settings.publicAppUrl,
    password_set: settings.passwordSet,
    password_unreadable: settings.passwordUnreadable,
  };
}

function patchFromBody(body: MailSettingsBody): ServerMailSettingsPatch {
  const patch: ServerMailSettingsPatch = {};
  if (body.smtp_host !== undefined) {
    if (typeof body.smtp_host !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_HOST", "smtp host must be a string");
    }
    patch.smtpHost = body.smtp_host;
  }
  if (body.smtp_port !== undefined) {
    if (body.smtp_port !== null && typeof body.smtp_port !== "number" && typeof body.smtp_port !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_PORT", "smtp port must be a number");
    }
    patch.smtpPort = body.smtp_port as number | string | null;
  }
  if (body.smtp_tls_mode !== undefined) {
    if (body.smtp_tls_mode !== null && typeof body.smtp_tls_mode !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_TLS_MODE", "smtp tls mode must be a string");
    }
    patch.smtpTlsMode = body.smtp_tls_mode as SmtpTlsMode | null;
  }
  if (body.smtp_username !== undefined) {
    if (typeof body.smtp_username !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_USERNAME", "smtp username must be a string");
    }
    patch.smtpUsername = body.smtp_username;
  }
  if (body.email_from !== undefined) {
    if (typeof body.email_from !== "string") {
      throw new HttpRequestError(400, "INVALID_EMAIL_FROM", "sender address must be a string");
    }
    patch.emailFrom = body.email_from;
  }
  if (body.public_app_url !== undefined) {
    if (typeof body.public_app_url !== "string") {
      throw new HttpRequestError(400, "INVALID_PUBLIC_APP_URL", "public app URL must be a string");
    }
    patch.publicAppUrl = body.public_app_url;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_PASSWORD", "smtp password must be a string");
    }
    patch.password = body.password;
  }
  if (body.clear_password !== undefined) {
    if (body.clear_password !== true) {
      throw new HttpRequestError(400, "INVALID_MAIL_SETTINGS", "clear_password must be true");
    }
    patch.clearPassword = true;
  }
  return patch;
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

function writeError(ctx: Parameters<RouteHandler>[0], error: unknown): void {
  if (error instanceof HttpRequestError) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  if (error instanceof MailSettingsError) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  throw error;
}

function errorBody(error: string, message: string, requestId: string) {
  return { error, message, requestId };
}
