/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 13,
  device_approval_request: 15,
  workspace_invite: 10,
  two_factor_enabled: 12,
  two_factor_disabled: 9,
  two_factor_backup_codes_regenerated: 12,
  account_email_changed: 9,
  device_recovery_approval_request: 12,
  contact_recovery_release_request: 11,
  trusted_contact_invite: 9,
  plan_change_request: 13,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
