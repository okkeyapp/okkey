import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import { effectiveDeploymentMode } from "../deployment-mode.ts";
import { HttpRequestError, json, readJsonBody, type RouteHandler } from "../http.ts";
import { getHeader } from "../http.ts";
import { MailSettingsError } from "../mail-settings/service.ts";
import { serializeSettings } from "../mail-settings/routes.ts";
import type { ServerMailSettingsPatch } from "../mail-settings/types.ts";
import { SetupError, type SetupService } from "./service.ts";
import type { RegistrationMode } from "./types.ts";

type MailBody = {
  smtp_host?: unknown;
  smtp_port?: unknown;
  smtp_tls_mode?: unknown;
  smtp_username?: unknown;
  email_from?: unknown;
  public_app_url?: unknown;
  password?: unknown;
  clear_password?: unknown;
  recipient_email?: unknown;
};

function setupTokenFromRequest(req: IncomingMessage): string | null {
  const header = getHeader(req, "x-setup-token")?.trim();
  if (header) {
    return header;
  }
  const auth = getHeader(req, "authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

function errorBody(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

function writeSetupError(
  ctx: { res: Parameters<typeof json>[0]; requestId: string },
  error: unknown,
): void {
  if (error instanceof SetupError || error instanceof MailSettingsError) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  if (error instanceof HttpRequestError) {
    json(ctx.res, error.statusCode, errorBody(error.code, error.message, ctx.requestId));
    return;
  }
  throw error;
}

function patchFromBody(body: MailBody): ServerMailSettingsPatch {
  const patch: ServerMailSettingsPatch = {};
  if (body.smtp_host !== undefined) {
    if (typeof body.smtp_host !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_HOST", "smtp host must be a string");
    }
    patch.smtpHost = body.smtp_host;
  }
  if (body.smtp_port !== undefined) {
    if (body.smtp_port !== null && typeof body.smtp_port !== "number") {
      throw new HttpRequestError(400, "INVALID_SMTP_PORT", "smtp port must be a number");
    }
    patch.smtpPort = body.smtp_port as number | null;
  }
  if (body.smtp_tls_mode !== undefined) {
    if (typeof body.smtp_tls_mode !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_TLS_MODE", "smtp tls mode must be a string");
    }
    patch.smtpTlsMode = body.smtp_tls_mode as ServerMailSettingsPatch["smtpTlsMode"];
  }
  if (body.smtp_username !== undefined) {
    if (typeof body.smtp_username !== "string") {
      throw new HttpRequestError(400, "INVALID_SMTP_USERNAME", "smtp username must be a string");
    }
    patch.smtpUsername = body.smtp_username;
  }
  if (body.email_from !== undefined) {
    if (typeof body.email_from !== "string") {
      throw new HttpRequestError(400, "INVALID_EMAIL_FROM", "email from must be a string");
    }
    patch.emailFrom = body.email_from;
  }
  if (body.public_app_url !== undefined) {
    if (typeof body.public_app_url !== "string") {
      throw new HttpRequestError(400, "INVALID_PUBLIC_APP_URL", "public app url must be a string");
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
    patch.clearPassword = Boolean(body.clear_password);
  }
  return patch;
}

function hideInSaas(
  config: Pick<ApiConfig, "deploymentMode">,
  ctx: { res: Parameters<typeof json>[0]; requestId: string },
): boolean {
  if (effectiveDeploymentMode(config) === "saas") {
    json(ctx.res, 404, errorBody("NOT_FOUND", "not found", ctx.requestId));
    return true;
  }
  return false;
}

export function registerSetupRoutes(
  route: (method: string, path: string, handler: RouteHandler) => void,
  config: Pick<ApiConfig, "deploymentMode">,
  setup: SetupService,
): void {
  route("GET", "/public/setup/status", async (ctx) => {
    const status = await setup.getStatus();
    json(ctx.res, 200, {
      required: status.required,
      deployment_mode: status.deploymentMode,
      requestId: ctx.requestId,
    });
  });

  route("GET", "/public/setup/smtp-providers", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    json(ctx.res, 200, {
      providers: setup.listSmtpProviderTemplates(),
      requestId: ctx.requestId,
    });
  });

  route("POST", "/public/setup/verify", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const body = await readJsonBody<{ code?: unknown }>(ctx.req);
      const code = typeof body.code === "string" ? body.code : "";
      const result = await setup.verifyCode(code);
      json(ctx.res, 200, {
        setup_token: result.setupToken,
        expires_at: result.expiresAt,
        requestId: ctx.requestId,
      });
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("GET", "/public/setup/mail-settings", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const settings = await setup.getMailSettings(setupTokenFromRequest(ctx.req) ?? "");
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("PATCH", "/public/setup/mail-settings", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const body = await readJsonBody<MailBody>(ctx.req);
      const settings = await setup.updateMailSettings(
        setupTokenFromRequest(ctx.req) ?? "",
        patchFromBody(body),
      );
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("POST", "/public/setup/mail-settings/test-email", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const body = await readJsonBody<MailBody>(ctx.req);
      const recipient =
        typeof body.recipient_email === "string" ? body.recipient_email : "";
      const settings = await setup.sendTestEmail(
        setupTokenFromRequest(ctx.req) ?? "",
        patchFromBody(body),
        recipient,
      );
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("POST", "/public/setup/mail-settings/skip", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const settings = await setup.skipMail(setupTokenFromRequest(ctx.req) ?? "");
      json(ctx.res, 200, serializeSettings(settings));
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("GET", "/public/setup/instance", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const instance = await setup.getInstance(setupTokenFromRequest(ctx.req) ?? "");
      json(ctx.res, 200, {
        public_app_url: instance.publicAppUrl,
        registration_mode: instance.registrationMode,
        requestId: ctx.requestId,
      });
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("PATCH", "/public/setup/instance", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const body = await readJsonBody<{
        public_app_url?: unknown;
        registration_mode?: unknown;
      }>(ctx.req);
      const patch: { publicAppUrl?: string; registrationMode?: RegistrationMode } = {};
      if (body.public_app_url !== undefined) {
        if (typeof body.public_app_url !== "string") {
          throw new HttpRequestError(400, "INVALID_PUBLIC_APP_URL", "public app url must be a string");
        }
        patch.publicAppUrl = body.public_app_url;
      }
      if (body.registration_mode !== undefined) {
        if (body.registration_mode !== "open" && body.registration_mode !== "invite_only") {
          throw new HttpRequestError(400, "INVALID_REGISTRATION_MODE", "invalid registration mode");
        }
        if (body.registration_mode === "open") {
          throw new HttpRequestError(
            400,
            "REGISTRATION_MODE_LOCKED",
            "self-hosted instances only allow invite-only registration",
          );
        }
        patch.registrationMode = "invite_only";
      }
      const instance = await setup.updateInstance(setupTokenFromRequest(ctx.req) ?? "", patch);
      json(ctx.res, 200, {
        public_app_url: instance.publicAppUrl,
        registration_mode: instance.registrationMode,
        requestId: ctx.requestId,
      });
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("POST", "/public/setup/begin-registration", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const body = await readJsonBody<{ email?: unknown }>(ctx.req);
      const email = typeof body.email === "string" ? body.email : "";
      const result = await setup.beginRegistration(setupTokenFromRequest(ctx.req) ?? "", email);
      json(ctx.res, 200, {
        ...(result.authStateId ? { auth_state_id: result.authStateId } : {}),
        email: result.email,
        expires_at: result.expiresAt,
        already_registered: Boolean(result.alreadyRegistered),
        requestId: ctx.requestId,
      });
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });

  route("POST", "/public/setup/finish", async (ctx) => {
    if (hideInSaas(config, ctx)) {
      return;
    }
    try {
      const setupToken = setupTokenFromRequest(ctx.req) ?? "";
      const body = await readJsonBody<{
        workspace_name?: unknown;
        tile_color?: unknown;
        invitations?: unknown;
        dismiss_personal_data_bootstrap?: unknown;
      }>(ctx.req);
      const workspaceName =
        typeof body.workspace_name === "string" ? body.workspace_name : "";
      const tileColor = typeof body.tile_color === "string" ? body.tile_color : undefined;
      const invitations: Array<{ email: string; roleBuiltinId?: "admin" | "user" }> = [];
      if (Array.isArray(body.invitations)) {
        for (const item of body.invitations) {
          if (!item || typeof item !== "object") {
            continue;
          }
          const email = typeof (item as { email?: unknown }).email === "string"
            ? (item as { email: string }).email
            : "";
          const roleRaw = (item as { role_builtin_id?: unknown }).role_builtin_id;
          const roleBuiltinId =
            roleRaw === "admin" || roleRaw === "user" ? roleRaw : undefined;
          if (email.trim()) {
            invitations.push({ email, roleBuiltinId });
          }
        }
      }
      const result = await setup.finish(setupToken, {
        workspaceName,
        tileColor,
        invitations,
        dismissPersonalDataBootstrap: body.dismiss_personal_data_bootstrap === true,
      });
      if (result.signInRequired) {
        json(ctx.res, 200, {
          sign_in_required: true,
          user_id: result.userId,
          workspace_id: result.workspaceId,
          vault_id: result.vaultId,
          device_id: result.deviceId,
          requestId: ctx.requestId,
        });
        return;
      }
      json(ctx.res, 200, {
        sign_in_required: false,
        access_token: result.accessToken,
        expires_at: result.expiresAt,
        user_id: result.userId,
        workspace_id: result.workspaceId,
        vault_id: result.vaultId,
        device_id: result.deviceId,
        token_type: result.tokenType,
        requestId: ctx.requestId,
      });
    } catch (error) {
      writeSetupError(ctx, error);
    }
  });
}
