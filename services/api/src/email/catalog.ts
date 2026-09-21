import {
  EmailRenderError,
  listTemplateMeta as listTemplateMetaFromPkg,
  renderEmailTemplate as renderEmailTemplateFromPkg,
  type EmailTemplateId,
  type EmailTemplateVariablesMap,
} from "@okkey/email-templates";
import { EmailTemplateError } from "./errors.ts";
import type { EmailLocale } from "./locale.ts";

export type {
  AuthEmailCodeVariables,
  ContactRecoveryReleaseRequestVariables,
  DeviceApprovalRequestVariables,
  DeviceRecoveryApprovalRequestVariables,
  EmailTemplateVariablesMap,
  TrustedContactInviteVariables,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "@okkey/email-templates";
export type { EmailTemplateId };

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export async function renderEmailTemplate<Id extends EmailTemplateId>(
  templateId: Id,
  locale: EmailLocale,
  variables: EmailTemplateVariablesMap[Id],
): Promise<RenderedEmail> {
  try {
    return await renderEmailTemplateFromPkg(templateId, locale, variables);
  } catch (error) {
    if (error instanceof EmailRenderError) {
      throw new EmailTemplateError(
        error.code === "EMAIL_TEMPLATE_MISSING_VARIABLE"
          ? "EMAIL_TEMPLATE_MISSING_VARIABLE"
          : "EMAIL_RENDER_FAILED",
        error.message,
        {
          templateId: error.templateId ?? templateId,
          ...(error.details ?? {}),
        },
      );
    }
    throw new EmailTemplateError(
      "EMAIL_RENDER_FAILED",
      error instanceof Error ? error.message : "render failed",
      { templateId, cause: String(error) },
    );
  }
}

export function listTemplateMeta(): Array<{ id: EmailTemplateId; version: number }> {
  return listTemplateMetaFromPkg();
}
