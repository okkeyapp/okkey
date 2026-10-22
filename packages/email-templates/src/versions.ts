/** Bump when template structure or copy source changes (ops / auditing). */
export const EMAIL_TEMPLATE_VERSIONS = {
  auth_email_code: 7,
  device_approval_request: 9,
  workspace_invite: 5,
  two_factor_enabled: 6,
  two_factor_disabled: 3,
  two_factor_backup_codes_regenerated: 6,
  account_email_changed: 3,
  device_recovery_approval_request: 6,
  contact_recovery_release_request: 5,
  trusted_contact_invite: 4,
  plan_change_request: 4,
} as const;

export type EmailTemplateId = keyof typeof EMAIL_TEMPLATE_VERSIONS;
