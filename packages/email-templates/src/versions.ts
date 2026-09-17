/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 4,
  device_approval_request: 5,
  workspace_invite: 3,
  two_factor_enabled: 3,
  two_factor_backup_codes_regenerated: 3,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
