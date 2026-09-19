/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 4,
  device_approval_request: 5,
  workspace_invite: 3,
  two_factor_enabled: 3,
  two_factor_backup_codes_regenerated: 3,
  device_recovery_approval_request: 2,
  contact_recovery_release_request: 1,
  trusted_contact_invite: 1,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
