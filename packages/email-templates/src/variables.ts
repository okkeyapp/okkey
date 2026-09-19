export interface AuthEmailCodeVariables {
  code: string;
  ttlSeconds: number;
}

export interface DeviceApprovalRequestVariables {
  deviceName: string;
  platform: string;
  osName: string;
  requestIp: string;
  helpUrl: string;
  country?: string | null;
  city?: string | null;
  /** ISO timestamp of the approval request (shown as date + time). */
  requestedAtIso?: string | null;
}

export interface WorkspaceInviteVariables {
  inviterDisplayName: string;
  workspaceName: string;
  inviteUrl: string;
}

export interface TwoFactorNoticeVariables {
  occurredAtIso: string;
  securitySettingsUrl: string;
}

export interface DeviceRecoveryApprovalRequestVariables {
  helpUrl: string;
  /** ISO timestamp when the recovery request was created. */
  requestedAtIso: string;
  /** ISO timestamp when the request expires. */
  expiresAtIso: string;
  /** Same device fields as {@link DeviceApprovalRequestVariables}. */
  deviceName: string;
  platform: string;
  osName: string;
  requestIp: string;
  country?: string | null;
  city?: string | null;
}

export interface ContactRecoveryReleaseRequestVariables {
  helpUrl: string;
  ownerEmail: string;
  requestedAtIso: string;
  expiresAtIso: string;
}

export type EmailTemplateVariablesMap = {
  auth_email_code: AuthEmailCodeVariables;
  device_approval_request: DeviceApprovalRequestVariables;
  workspace_invite: WorkspaceInviteVariables;
  two_factor_enabled: TwoFactorNoticeVariables;
  two_factor_backup_codes_regenerated: TwoFactorNoticeVariables;
  device_recovery_approval_request: DeviceRecoveryApprovalRequestVariables;
  contact_recovery_release_request: ContactRecoveryReleaseRequestVariables;
};
