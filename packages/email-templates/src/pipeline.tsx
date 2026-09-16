import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";
import { render } from "@react-email/render";
import * as React from "react";
import { AuthSignInCodeEmail } from "./components/AuthSignInCodeEmail.js";
import { DeviceApprovalEmail } from "./components/DeviceApprovalEmail.js";
import { TwoFactorNoticeEmail } from "./components/TwoFactorNoticeEmail.js";
import { WorkspaceInviteEmail } from "./components/WorkspaceInviteEmail.js";
import {
  buildAuthSignInCodeEmailProps,
  buildDeviceApprovalEmailProps,
  buildTwoFactorBackupRegeneratedEmailProps,
  buildTwoFactorEnabledEmailProps,
  buildWorkspaceInviteEmailProps,
} from "./email-props.js";
import { EmailRenderError } from "./errors.js";
import type { RenderedEmail } from "./rendered.js";
import type {
  AuthEmailCodeVariables,
  DeviceApprovalRequestVariables,
  EmailTemplateVariablesMap,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "./variables.js";
import { EMAIL_TEMPLATE_VERSIONS, type EmailTemplateId } from "./versions.js";

function assertRequired(
  templateId: EmailTemplateId,
  variables: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const value = variables[key];
    if (value === undefined || value === null) {
      throw new EmailRenderError("EMAIL_TEMPLATE_MISSING_VARIABLE", `missing: ${key}`, {
        templateId,
        details: { key },
      });
    }
    if (typeof value === "string" && value.trim().length === 0) {
      throw new EmailRenderError("EMAIL_TEMPLATE_MISSING_VARIABLE", `empty: ${key}`, {
        templateId,
        details: { key },
      });
    }
  }
}

export async function renderAuthEmailCode(
  locale: EmailLocale,
  variables: AuthEmailCodeVariables,
): Promise<RenderedEmail> {
  assertRequired("auth_email_code", variables as unknown as Record<string, unknown>, [
    "code",
    "ttlSeconds",
  ]);
  if (variables.ttlSeconds < 1 || !/^\d{6}$/.test(variables.code)) {
    throw new EmailRenderError("EMAIL_RENDER_FAILED", "invalid auth_email_code variables", {
      templateId: "auth_email_code",
    });
  }
  const minutes = Math.ceil(variables.ttlSeconds / 60);
  const subject = formatEmailMessage(locale, "email.auth.signInCode.subject", {});
  const props = buildAuthSignInCodeEmailProps(locale, variables);
  const plainText = formatEmailMessage(locale, "email.auth.signInCode.plain", {
    code: variables.code,
    minutes,
  });
  const element = <AuthSignInCodeEmail {...props} />;
  const html = await render(element);
  return { subject, html, text: plainText };
}

export async function renderDeviceApprovalRequest(
  locale: EmailLocale,
  variables: DeviceApprovalRequestVariables,
): Promise<RenderedEmail> {
  assertRequired("device_approval_request", variables as unknown as Record<string, unknown>, [
    "deviceName",
    "platform",
    "osName",
    "requestIp",
  ]);
  if (variables.helpUrl === undefined || variables.helpUrl === null) {
    throw new EmailRenderError("EMAIL_TEMPLATE_MISSING_VARIABLE", "missing: helpUrl", {
      templateId: "device_approval_request",
      details: { key: "helpUrl" },
    });
  }
  const helpUrl = variables.helpUrl.trim();
  const props = buildDeviceApprovalEmailProps(locale, variables);
  const { lead, deviceLine, platformLine, ipLine, locationLine, noteNoUrl } = props;
  const footer = helpUrl
    ? formatEmailMessage(locale, "email.device.approval.textFooterWithUrl", { helpUrl })
    : noteNoUrl;
  const plainText = formatEmailMessage(locale, "email.device.approval.plain", {
    lead,
    deviceLine,
    platformLine,
    ipLine,
    locationLine: locationLine || "",
    footer,
  });
  const subject = formatEmailMessage(locale, "email.device.approval.subject", {});
  const element = <DeviceApprovalEmail {...props} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { subject, html, text: text.trim().length > 0 ? text : plainText };
}

export async function renderWorkspaceInvite(
  locale: EmailLocale,
  variables: WorkspaceInviteVariables,
): Promise<RenderedEmail> {
  assertRequired("workspace_invite", variables as unknown as Record<string, unknown>, [
    "inviterDisplayName",
    "workspaceName",
    "inviteUrl",
  ]);
  const inviteUrl = variables.inviteUrl.trim();
  if (!/^https?:\/\//i.test(inviteUrl)) {
    throw new EmailRenderError("EMAIL_RENDER_FAILED", "inviteUrl must be http(s)", {
      templateId: "workspace_invite",
    });
  }
  const subject = formatEmailMessage(locale, "email.workspaceInvite.subject", {
    workspaceName: variables.workspaceName,
  });
  const props = buildWorkspaceInviteEmailProps(locale, variables);
  const plainText = formatEmailMessage(locale, "email.workspaceInvite.plain", {
    inviter: variables.inviterDisplayName,
    workspaceName: variables.workspaceName,
    inviteUrl,
  });
  const element = <WorkspaceInviteEmail {...props} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { subject, html, text: text.trim().length > 0 ? text : plainText };
}

async function renderTwoFactorNotice(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
  templateId: "two_factor_enabled" | "two_factor_backup_codes_regenerated",
  keys: {
    subject: string;
    plain: string;
    plainFooterUrl: string;
  },
): Promise<RenderedEmail> {
  assertRequired(templateId, variables as unknown as Record<string, unknown>, ["occurredAtIso"]);
  if (
    variables.securitySettingsUrl === undefined ||
    variables.securitySettingsUrl === null
  ) {
    throw new EmailRenderError("EMAIL_TEMPLATE_MISSING_VARIABLE", "missing: securitySettingsUrl", {
      templateId,
      details: { key: "securitySettingsUrl" },
    });
  }
  const securityUrl = variables.securitySettingsUrl.trim();
  const props =
    templateId === "two_factor_enabled"
      ? buildTwoFactorEnabledEmailProps(locale, variables)
      : buildTwoFactorBackupRegeneratedEmailProps(locale, variables);
  const { line1, line2 } = props;
  const subject = formatEmailMessage(locale, keys.subject, {});
  const footer = securityUrl
    ? formatEmailMessage(locale, keys.plainFooterUrl, { url: securityUrl })
    : "";
  const plainText = formatEmailMessage(locale, keys.plain, {
    line1,
    line2,
    footer,
  });
  const element = <TwoFactorNoticeEmail {...props} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return { subject, html, text: text.trim().length > 0 ? text : plainText };
}

export function renderTwoFactorEnabled(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): Promise<RenderedEmail> {
  return renderTwoFactorNotice(locale, variables, "two_factor_enabled", {
    subject: "email.twoFactor.enabled.subject",
    plain: "email.twoFactor.enabled.plain",
    plainFooterUrl: "email.twoFactor.enabled.plainFooterUrl",
  });
}

export function renderTwoFactorBackupRegenerated(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): Promise<RenderedEmail> {
  return renderTwoFactorNotice(locale, variables, "two_factor_backup_codes_regenerated", {
    subject: "email.twoFactor.backupRegen.subject",
    plain: "email.twoFactor.backupRegen.plain",
    plainFooterUrl: "email.twoFactor.backupRegen.plainFooterUrl",
  });
}

export async function renderEmailTemplate<Id extends EmailTemplateId>(
  templateId: Id,
  locale: EmailLocale,
  variables: EmailTemplateVariablesMap[Id],
): Promise<RenderedEmail> {
  try {
    switch (templateId) {
      case "auth_email_code":
        return await renderAuthEmailCode(locale, variables as AuthEmailCodeVariables);
      case "device_approval_request":
        return await renderDeviceApprovalRequest(
          locale,
          variables as DeviceApprovalRequestVariables,
        );
      case "workspace_invite":
        return await renderWorkspaceInvite(locale, variables as WorkspaceInviteVariables);
      case "two_factor_enabled":
        return await renderTwoFactorEnabled(locale, variables as TwoFactorNoticeVariables);
      case "two_factor_backup_codes_regenerated":
        return await renderTwoFactorBackupRegenerated(
          locale,
          variables as TwoFactorNoticeVariables,
        );
      default:
        throw new EmailRenderError("EMAIL_RENDER_FAILED", `unknown templateId: ${templateId}`, {
          templateId,
        });
    }
  } catch (error) {
    if (error instanceof EmailRenderError) {
      throw error;
    }
    throw new EmailRenderError(
      "EMAIL_RENDER_FAILED",
      error instanceof Error ? error.message : "render failed",
      { templateId, details: { cause: String(error) } },
    );
  }
}

export function listTemplateMeta(): Array<{ id: EmailTemplateId; version: number }> {
  return (Object.keys(EMAIL_TEMPLATE_VERSIONS) as EmailTemplateId[]).map((id) => ({
    id,
    version: EMAIL_TEMPLATE_VERSIONS[id],
  }));
}
