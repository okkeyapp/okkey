/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 10,
  device_approval_request: 12,
  workspace_invite: 7,
  two_factor_enabled: 9,
  two_factor_disabled: 6,
  two_factor_backup_codes_regenerated: 9,
  account_email_changed: 6,
  device_recovery_approval_request: 9,
  contact_recovery_release_request: 8,
  trusted_contact_invite: 6,
  plan_change_request: 10,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
