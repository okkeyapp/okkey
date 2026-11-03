import {
  buildLicenseRequestEmailCopy,
  type LicenseRequestEmailFields,
} from "@okkey/i18n";

export type LicenseMailtoFields = LicenseRequestEmailFields & {
  /** Required sales inbox from API `sales_email` (no client-side default). */
  salesEmail: string;
  /**
   * Locale for subject/body labels (`en` | `ru`).
   * Also written into the Locale field via `fields.locale` when callers set both the same.
   */
  emailLocale?: string;
};

/**
 * Prefills a license-request mailto with the same subject/body as SMTP
 * (`buildLicenseRequestEmailCopy`). Used when outbound email is not deliverable.
 */
export function buildLicenseMailto(fields: LicenseMailtoFields): string {
  const to = fields.salesEmail.trim();
  if (!to) {
    throw new Error("sales email is required for mailto");
  }
  const emailLocale = fields.emailLocale ?? fields.locale;
  const { subject, body } = buildLicenseRequestEmailCopy(emailLocale, {
    workspaceName: fields.workspaceName,
    workspaceUrl: fields.workspaceUrl,
    currentPlanTier: fields.currentPlanTier,
    requestedPlanTier: fields.requestedPlanTier,
    deploymentMode: fields.deploymentMode,
    memberCount: fields.memberCount,
    region: fields.region,
    locale: fields.locale,
    senderEmail: fields.senderEmail,
    replyEmail: fields.replyEmail,
  });

  // Mailto clients treat `+` as a literal plus; use encodeURIComponent (%20 for spaces).
  const subjectEnc = encodeURIComponent(subject);
  const bodyEnc = encodeURIComponent(body);
  return `mailto:${to}?subject=${subjectEnc}&body=${bodyEnc}`;
}
