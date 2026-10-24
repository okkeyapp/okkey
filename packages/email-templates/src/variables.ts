/** Why the OTP was issued; selects subject/body copy for `auth_email_code`. */
export type AuthEmailCodePurpose = "sign_in" | "email_change";

export interface AuthEmailCodeVariables {
  code: string;
  ttlSeconds: number;
  /** Defaults to `sign_in` when omitted (login / registration OTP). */
  purpose?: AuthEmailCodePurpose;
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
  /** ISO timestamp when the pending approval challenge expires. */
  expiresAtIso?: string | null;
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

/** Notify the previous address after a successful account email change. */
export interface AccountEmailChangedVariables {
  /** Masked new address shown in the notice (e.g. `n***@example.com`). */
  newEmailMasked: string;
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

/** Invite an Okkey user to become a trusted recovery contact. */
export interface TrustedContactInviteVariables {
  inviterDisplayName: string;
  inviterEmail: string;
  helpUrl: string;
}

/** Internal sales notification for a workspace plan upgrade request. */
export interface PlanChangeRequestVariables {
  workspaceId: string;
  workspaceName: string;
  /** Public app base URL (`PUBLIC_APP_URL`); may be empty when unset. */
  workspaceUrl: string;
  currentPlanTier: string;
  requestedPlanTier: string;
  contactEmail: string;
  accountEmail: string;
  locale: string;
  region: string;
  /** Actual workspace member count (from `workspace_members`). */
  workspaceMemberCount: number;
  /** Deployment label for sales: `saas` or `self-hosted`. */
  deploymentMode: string;
  actorUserId: string;
}

export type EmailTemplateVariablesMap = {
  auth_email_code: AuthEmailCodeVariables;
  device_approval_request: DeviceApprovalRequestVariables;
  workspace_invite: WorkspaceInviteVariables;
  two_factor_enabled: TwoFactorNoticeVariables;
  two_factor_disabled: TwoFactorNoticeVariables;
  two_factor_backup_codes_regenerated: TwoFactorNoticeVariables;
  account_email_changed: AccountEmailChangedVariables;
  device_recovery_approval_request: DeviceRecoveryApprovalRequestVariables;
  contact_recovery_release_request: ContactRecoveryReleaseRequestVariables;
  trusted_contact_invite: TrustedContactInviteVariables;
  plan_change_request: PlanChangeRequestVariables;
};
