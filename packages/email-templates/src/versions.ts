/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 11,
  device_approval_request: 13,
  workspace_invite: 8,
  two_factor_enabled: 10,
  two_factor_disabled: 7,
  two_factor_backup_codes_regenerated: 10,
  account_email_changed: 7,
  device_recovery_approval_request: 10,
  contact_recovery_release_request: 9,
  trusted_contact_invite: 7,
  plan_change_request: 11,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
