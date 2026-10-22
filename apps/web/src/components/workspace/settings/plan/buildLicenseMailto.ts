/** Default sales inbox when API does not return `sales_email`. */
export const DEFAULT_LICENSE_SALES_EMAIL = "get-license@okkey.io";

export type LicenseMailtoFields = {
  salesEmail?: string | null;
  workspaceName: string;
  workspaceUrl: string;
  /** Expected seats; omitted from body when null/undefined. */
  memberCount?: number | null;
  region: string | null;
  locale: string;
  senderEmail: string;
  replyEmail?: string | null;
};

/**
 * Prefills a license-request mailto with auto fields from workspace/settings.
 * Used when outbound email is not deliverable (`sales_email_deliverable: false`).
 */
export function buildLicenseMailto(fields: LicenseMailtoFields): string {
  const to =
    (fields.salesEmail ?? "").trim() || DEFAULT_LICENSE_SALES_EMAIL;
  const workspaceLabel = fields.workspaceName.trim() || "workspace";
  const subject = `License request: ${workspaceLabel}`;

  const lines: string[] = [
    `Workspace name: ${fields.workspaceName.trim() || "—"}`,
    `Workspace URL: ${fields.workspaceUrl.trim() || "—"}`,
  ];
  if (
    typeof fields.memberCount === "number" &&
    Number.isFinite(fields.memberCount) &&
    fields.memberCount >= 1
  ) {
    lines.push(`Members: ${fields.memberCount}`);
  } else {
    lines.push("Members: ");
  }
  lines.push(
    `Region: ${fields.region?.trim() || "—"}`,
    `Locale: ${fields.locale.trim() || "—"}`,
    `Sender: ${fields.senderEmail.trim() || "—"}`,
  );
  const reply = (fields.replyEmail ?? fields.senderEmail).trim();
  if (reply) {
    lines.push(`Reply email: ${reply}`);
  }

  // Mailto clients treat `+` as a literal plus; use encodeURIComponent (%20 for spaces).
  const subjectEnc = encodeURIComponent(subject);
  const bodyEnc = encodeURIComponent(lines.join("\n"));
  return `mailto:${to}?subject=${subjectEnc}&body=${bodyEnc}`;
}
