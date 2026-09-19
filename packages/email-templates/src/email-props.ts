import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";
import type { AuthSignInCodeEmailProps } from "./components/AuthSignInCodeEmail.js";
import type { DeviceApprovalEmailProps } from "./components/DeviceApprovalEmail.js";
import type { TwoFactorNoticeEmailProps } from "./components/TwoFactorNoticeEmail.js";
import type { WorkspaceInviteEmailProps } from "./components/WorkspaceInviteEmail.js";
import { formatUtcWhen } from "./format-utc.js";
import type {
  AuthEmailCodeVariables,
  ContactRecoveryReleaseRequestVariables,
  DeviceApprovalRequestVariables,
  DeviceRecoveryApprovalRequestVariables,
  TrustedContactInviteVariables,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "./variables.js";
import type { RecoveryActionEmailProps } from "./components/RecoveryActionEmail.js";

export function buildAuthSignInCodeEmailProps(
  locale: EmailLocale,
  variables: AuthEmailCodeVariables,
): AuthSignInCodeEmailProps {
  const minutes = Math.ceil(variables.ttlSeconds / 60);
  return {
    beforeCode: formatEmailMessage(locale, "email.auth.signInCode.beforeCode", {}),
    code: variables.code,
    line2: formatEmailMessage(locale, "email.auth.signInCode.line2", { minutes }),
    ignore: formatEmailMessage(locale, "email.auth.signInCode.ignore", {}),
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
  const whenLine = variables.requestedAtIso
    ? formatEmailMessage(locale, "email.device.approval.whenLine", {
        when: formatUtcWhen(locale, variables.requestedAtIso),
      })
    : "";
  const ipLine = formatEmailMessage(locale, "email.device.approval.ipLine", {
    ip: variables.requestIp,
  });
  const locationParts = [variables.city, variables.country].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  const locationLine =
    locationParts.length > 0
      ? formatEmailMessage(locale, "email.device.approval.locationLine", {
          location: locationParts.join(", "),
        })
      : "";
  const ctaLabel = formatEmailMessage(locale, "email.device.approval.ctaOpenSettings", {});
  const noteNoUrl = formatEmailMessage(locale, "email.device.approval.noteNoUrl", {});
  const noteBlockIfNotYou = formatEmailMessage(
    locale,
    "email.device.approval.noteBlockIfNotYou",
    {},
  );
  const noteIgnoreIfMistake = formatEmailMessage(
    locale,
    "email.device.approval.noteIgnoreIfMistake",
    {},
  );
  return {
    lead,
    deviceLine,
    platformLine,
    whenLine,
    ipLine,
    locationLine,
    helpUrl,
    ctaLabel,
    noteNoUrl,
    noteBlockIfNotYou,
    noteIgnoreIfMistake,
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

export function buildDeviceRecoveryApprovalEmailProps(
  locale: EmailLocale,
  variables: DeviceRecoveryApprovalRequestVariables,
): DeviceApprovalEmailProps {
  const platformOs = `${variables.platform} · ${variables.osName}`;
  const locationParts = [variables.city, variables.country].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return {
    lead: formatEmailMessage(locale, "email.device.recovery.lead", {}),
    deviceLine: formatEmailMessage(locale, "email.device.approval.deviceLine", {
      deviceName: variables.deviceName,
    }),
    platformLine: formatEmailMessage(locale, "email.device.approval.platformLine", {
      platformOs,
    }),
    whenLine: formatEmailMessage(locale, "email.device.approval.whenLine", {
      when: formatUtcWhen(locale, variables.requestedAtIso),
    }),
    expiresLine: formatEmailMessage(locale, "email.device.recovery.expiresLine", {
      when: formatUtcWhen(locale, variables.expiresAtIso),
    }),
    ipLine: formatEmailMessage(locale, "email.device.approval.ipLine", {
      ip: variables.requestIp,
    }),
    locationLine:
      locationParts.length > 0
        ? formatEmailMessage(locale, "email.device.approval.locationLine", {
            location: locationParts.join(", "),
          })
        : "",
    helpUrl: variables.helpUrl.trim(),
    ctaLabel: formatEmailMessage(locale, "email.device.recovery.cta", {}),
    noteNoUrl: formatEmailMessage(locale, "email.device.recovery.noteNoUrl", {}),
    noteBlockIfNotYou: formatEmailMessage(locale, "email.device.approval.noteBlockIfNotYou", {}),
    noteIgnoreIfMistake: formatEmailMessage(locale, "email.device.recovery.noteIgnore", {}),
  };
}

export function buildContactRecoveryReleaseEmailProps(
  locale: EmailLocale,
  variables: ContactRecoveryReleaseRequestVariables,
): RecoveryActionEmailProps {
  return {
    lead: formatEmailMessage(locale, "email.contacts.recovery.lead", {}),
    detailLine: formatEmailMessage(locale, "email.contacts.recovery.detailLine", {
      ownerEmail: variables.ownerEmail,
      when: formatUtcWhen(locale, variables.requestedAtIso),
    }),
    expiresLine: formatEmailMessage(locale, "email.contacts.recovery.expiresLine", {
      when: formatUtcWhen(locale, variables.expiresAtIso),
    }),
    helpUrl: variables.helpUrl.trim(),
    ctaLabel: formatEmailMessage(locale, "email.contacts.recovery.cta", {}),
    noteNoUrl: formatEmailMessage(locale, "email.contacts.recovery.noteNoUrl", {}),
    noteIgnore: formatEmailMessage(locale, "email.contacts.recovery.noteIgnore", {}),
  };
}

export function buildTrustedContactInviteEmailProps(
  locale: EmailLocale,
  variables: TrustedContactInviteVariables,
): RecoveryActionEmailProps {
  return {
    lead: formatEmailMessage(locale, "email.contacts.invite.lead", {
      inviter: variables.inviterDisplayName,
    }),
    detailLine: formatEmailMessage(locale, "email.contacts.invite.detailLine", {
      inviterEmail: variables.inviterEmail,
    }),
    expiresLine: formatEmailMessage(locale, "email.contacts.invite.whatToDo", {}),
    helpUrl: variables.helpUrl.trim(),
    ctaLabel: formatEmailMessage(locale, "email.contacts.invite.cta", {}),
    noteNoUrl: formatEmailMessage(locale, "email.contacts.invite.noteNoUrl", {}),
    noteIgnore: formatEmailMessage(locale, "email.contacts.invite.noteIgnore", {}),
  };
}

/** Sample data for React Email dev previews (`yarn dev:email`). */
export const previewSampleAuthCode: AuthEmailCodeVariables = {
  code: "123456",
  ttlSeconds: 300,
};

export const previewSampleDeviceApproval: DeviceApprovalRequestVariables = {
  deviceName: "Web macOS - Chrome",
  platform: "Web · Chrome",
  osName: "macOS",
  requestIp: "203.0.113.9",
  country: "Singapore",
  city: "Singapore",
  helpUrl: "https://app.okkey.local/items?popup=settings|devices",
  requestedAtIso: "2026-01-15T10:00:00.000Z",
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

export const previewSampleTrustedContactInvite: TrustedContactInviteVariables = {
  inviterDisplayName: "Alex Okkey",
  inviterEmail: "alex@example.com",
  helpUrl: "https://app.okkey.local/items?popup=settings|recovery",
};
