/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 5,
  device_approval_request: 7,
  workspace_invite: 4,
  two_factor_enabled: 4,
  two_factor_backup_codes_regenerated: 4,
  device_recovery_approval_request: 4,
  contact_recovery_release_request: 3,
  trusted_contact_invite: 3,
  plan_change_request: 2,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
