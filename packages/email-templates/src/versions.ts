/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 12,
  device_approval_request: 14,
  workspace_invite: 9,
  two_factor_enabled: 11,
  two_factor_disabled: 8,
  two_factor_backup_codes_regenerated: 11,
  account_email_changed: 8,
  device_recovery_approval_request: 11,
  contact_recovery_release_request: 10,
  trusted_contact_invite: 8,
  plan_change_request: 12,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
