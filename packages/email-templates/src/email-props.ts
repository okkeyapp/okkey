import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";
import type { AuthSignInCodeEmailProps } from "./components/AuthSignInCodeEmail.js";
import type { DeviceApprovalEmailProps } from "./components/DeviceApprovalEmail.js";
import type { TwoFactorNoticeEmailProps } from "./components/TwoFactorNoticeEmail.js";
import type { WorkspaceInviteEmailProps } from "./components/WorkspaceInviteEmail.js";
import { formatUtcWhen } from "./format-utc.js";
import type {
  AuthEmailCodeVariables,
  DeviceApprovalRequestVariables,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "./variables.js";

export function buildAuthSignInCodeEmailProps(
  locale: EmailLocale,
  variables: AuthEmailCodeVariables,
): AuthSignInCodeEmailProps {
  const minutes = Math.ceil(variables.ttlSeconds / 60);
  return {
    beforeCode: formatEmailMessage(locale, "email.auth.signInCode.beforeCode", {}),
    code: variables.code,
    line2: formatEmailMessage(locale, "email.auth.signInCode.line2", { minutes }),
  };
}

export function buildDeviceApprovalEmailProps(
  locale: EmailLocale,
  variables: DeviceApprovalRequestVariables,
): DeviceApprovalEmailProps {
  const helpUrl = variables.helpUrl.trim();
  const platformOs = `${variables.platform} · ${variables.osName}`;
  const lead = formatEmailMessage(locale, "email.device.approval.lead", {});
  const deviceLine = formatEmailMessage(locale, "email.device.approval.deviceLine", {
    deviceName: variables.deviceName,
  });
  const platformLine = formatEmailMessage(locale, "email.device.approval.platformLine", {
    platformOs,
  });
  const ipLine = formatEmailMessage(locale, "email.device.approval.ipLine", {
    ip: variables.requestIp,
  });
  const ctaLabel = formatEmailMessage(locale, "email.device.approval.ctaOpenSettings", {});
  const noteNoUrl = formatEmailMessage(locale, "email.device.approval.noteNoUrl", {});
  return {
    lead,
    deviceLine,
    platformLine,
    ipLine,
    helpUrl,
    ctaLabel,
    noteNoUrl,
  };
}

export function buildWorkspaceInviteEmailProps(
  locale: EmailLocale,
  variables: WorkspaceInviteVariables,
): WorkspaceInviteEmailProps {
  const inviteUrl = variables.inviteUrl.trim();
  const intro = formatEmailMessage(locale, "email.workspaceInvite.intro", {
    inviter: variables.inviterDisplayName,
    workspaceName: variables.workspaceName,
  });
  const ctaLabel = formatEmailMessage(locale, "email.workspaceInvite.ctaAccept", {});
  return { intro, ctaLabel, inviteUrl };
}

const twoFactorEnabledKeys = {
  line1: "email.twoFactor.enabled.line1",
  line2: "email.twoFactor.enabled.line2",
  cta: "email.twoFactor.enabled.ctaSecurity",
} as const;

const twoFactorBackupKeys = {
  line1: "email.twoFactor.backupRegen.line1",
  line2: "email.twoFactor.backupRegen.line2",
  cta: "email.twoFactor.backupRegen.ctaSecurity",
} as const;

export function buildTwoFactorEnabledEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): TwoFactorNoticeEmailProps {
  const securityUrl = variables.securitySettingsUrl.trim();
  const whenUtc = formatUtcWhen(locale, variables.occurredAtIso);
  return {
    line1: formatEmailMessage(locale, twoFactorEnabledKeys.line1, { whenUtc }),
    line2: formatEmailMessage(locale, twoFactorEnabledKeys.line2, {}),
    securityUrl,
    ctaLabel: formatEmailMessage(locale, twoFactorEnabledKeys.cta, {}),
  };
}

export function buildTwoFactorBackupRegeneratedEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): TwoFactorNoticeEmailProps {
  const securityUrl = variables.securitySettingsUrl.trim();
  const whenUtc = formatUtcWhen(locale, variables.occurredAtIso);
  return {
    line1: formatEmailMessage(locale, twoFactorBackupKeys.line1, { whenUtc }),
    line2: formatEmailMessage(locale, twoFactorBackupKeys.line2, {}),
    securityUrl,
    ctaLabel: formatEmailMessage(locale, twoFactorBackupKeys.cta, {}),
  };
}

/** Sample data for React Email dev previews (`yarn dev:email`). */
export const previewSampleAuthCode: AuthEmailCodeVariables = {
  code: "123456",
  ttlSeconds: 300,
};

export const previewSampleDeviceApproval: DeviceApprovalRequestVariables = {
  deviceName: "MacBook Pro",
  platform: "desktop",
  osName: "macOS",
  requestIp: "203.0.113.9",
  helpUrl: "https://app.okkey.local/settings/devices",
};

export const previewSampleWorkspaceInvite: WorkspaceInviteVariables = {
  inviterDisplayName: "Alex",
  workspaceName: "Design",
  inviteUrl: "https://app.okkey.local/invite/sample-token",
};

export const previewSampleTwoFactor: TwoFactorNoticeVariables = {
  occurredAtIso: "2026-01-15T10:00:00.000Z",
  securitySettingsUrl: "https://app.okkey.local/settings/security",
};
