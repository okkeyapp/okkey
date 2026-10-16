/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 6,
  device_approval_request: 8,
  workspace_invite: 4,
  two_factor_enabled: 5,
  two_factor_disabled: 2,
  two_factor_backup_codes_regenerated: 5,
  account_email_changed: 2,
  device_recovery_approval_request: 5,
  contact_recovery_release_request: 4,
  trusted_contact_invite: 3,
  plan_change_request: 2,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
