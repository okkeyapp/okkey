import { isEmailLocale, type EmailLocale } from "./email-locale.js";
import { formatEmailMessage } from "./email-format.js";

/** Fields for the shared license-request subject/body (SMTP + mailto). */
export type LicenseRequestEmailFields = {
  workspaceName: string;
  workspaceUrl: string;
  /** Catalog / request tier labels as stored (e.g. FREE, ENTERPRISE). */
  currentPlanTier: string;
  requestedPlanTier: string;
  /** Sales-facing deployment label: `saas` or `self-hosted`. */
  deploymentMode: string;
  /** Expected seats; empty Members line when null/undefined/invalid. */
  memberCount?: number | null;
  region: string | null;
  /** Value shown in the Locale field (usually the request locale). */
  locale: string;
  senderEmail: string;
  replyEmail?: string | null;
};

export type LicenseRequestEmailCopy = {
  subject: string;
  /** Short lead above the field list (SMTP HTML + plain / mailto body). */
  lead: string;
  /** Plain field lines joined with `\n` — identical for SMTP text and mailto body. */
  body: string;
  lines: readonly string[];
};

function dash(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "—";
}

function resolveEmailLocale(locale: string): EmailLocale {
  return isEmailLocale(locale) ? locale : "en";
}

/**
 * Shared RU/EN subject + plain field-list body for license / plan-change sales mail.
 * Used by mailto (logger) and `plan_change_request` SMTP render so copy stays identical.
 */
export function buildLicenseRequestEmailCopy(
  emailLocale: string,
  fields: LicenseRequestEmailFields,
): LicenseRequestEmailCopy {
  const locale = resolveEmailLocale(emailLocale);
  const workspaceLabel = fields.workspaceName.trim() || "workspace";
  const requestedPlan = dash(fields.requestedPlanTier);
  const subject = formatEmailMessage(locale, "email.planChangeRequest.subject", {
    plan: requestedPlan,
    workspaceName: workspaceLabel,
  });
  const lead = formatEmailMessage(locale, "email.planChangeRequest.lead", {});

  const memberValue =
    typeof fields.memberCount === "number" &&
    Number.isFinite(fields.memberCount) &&
    fields.memberCount >= 1
      ? String(fields.memberCount)
      : "";

  const reply = (fields.replyEmail ?? fields.senderEmail).trim();

  const lines = [
    formatEmailMessage(locale, "email.planChangeRequest.workspaceName", {
      value: dash(fields.workspaceName),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.workspaceUrl", {
      value: dash(fields.workspaceUrl),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.requestedPlan", {
      value: requestedPlan,
    }),
    formatEmailMessage(locale, "email.planChangeRequest.currentPlan", {
      value: dash(fields.currentPlanTier),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.deploymentMode", {
      value: dash(fields.deploymentMode),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.members", {
      value: memberValue,
    }),
    formatEmailMessage(locale, "email.planChangeRequest.region", {
      value: dash(fields.region),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.locale", {
      value: dash(fields.locale),
    }),
    formatEmailMessage(locale, "email.planChangeRequest.sender", {
      value: dash(fields.senderEmail),
    }),
  ];

  if (reply) {
    lines.push(
      formatEmailMessage(locale, "email.planChangeRequest.replyEmail", {
        value: reply,
      }),
    );
  }

  return { subject, lead, lines, body: [lead, ...lines].join("\n") };
}
