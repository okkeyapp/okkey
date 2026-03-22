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

export type EmailTemplateVariablesMap = {
  auth_email_code: AuthEmailCodeVariables;
  device_approval_request: DeviceApprovalRequestVariables;
  workspace_invite: WorkspaceInviteVariables;
  two_factor_enabled: TwoFactorNoticeVariables;
  two_factor_backup_codes_regenerated: TwoFactorNoticeVariables;
};
