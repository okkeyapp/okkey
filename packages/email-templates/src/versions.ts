/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 8,
  device_approval_request: 10,
  workspace_invite: 5,
  two_factor_enabled: 7,
  two_factor_disabled: 4,
  two_factor_backup_codes_regenerated: 7,
  account_email_changed: 4,
  device_recovery_approval_request: 7,
  contact_recovery_release_request: 6,
  trusted_contact_invite: 4,
  plan_change_request: 6,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
