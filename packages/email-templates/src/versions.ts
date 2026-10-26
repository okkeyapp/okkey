/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 9,
  device_approval_request: 11,
  workspace_invite: 6,
  two_factor_enabled: 8,
  two_factor_disabled: 5,
  two_factor_backup_codes_regenerated: 8,
  account_email_changed: 5,
  device_recovery_approval_request: 8,
  contact_recovery_release_request: 7,
  trusted_contact_invite: 5,
  plan_change_request: 9,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
