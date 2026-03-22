/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 2,
  device_approval_request: 2,
  workspace_invite: 2,
  two_factor_enabled: 2,
  two_factor_backup_codes_regenerated: 2,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
