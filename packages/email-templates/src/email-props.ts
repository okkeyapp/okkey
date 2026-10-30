import { formatEmailMessage, type EmailLocale } from "@okkey/i18n";
import type { AuthSignInCodeEmailProps } from "./components/AuthSignInCodeEmail.js";
import type { DeviceApprovalEmailProps } from "./components/DeviceApprovalEmail.js";
import type { TwoFactorNoticeEmailProps } from "./components/TwoFactorNoticeEmail.js";
import type { WorkspaceInviteEmailProps } from "./components/WorkspaceInviteEmail.js";
import { resolveDeviceDetailName } from "./device-display-name.js";
import { formatUtcWhen } from "./format-utc.js";
import { buildEmailStandardFooterCopy } from "./standard-footer.js";
import type {
  AccountEmailChangedVariables,
  AuthEmailCodeVariables,
  ContactRecoveryReleaseRequestVariables,
  DeviceApprovalRequestVariables,
  DeviceRecoveryApprovalRequestVariables,
  TrustedContactInviteVariables,
  TwoFactorNoticeVariables,
  WorkspaceInviteVariables,
} from "./variables.js";
import type { RecoveryActionEmailProps } from "./components/RecoveryActionEmail.js";

function authEmailCodeMessagePrefix(
  purpose: AuthEmailCodeVariables["purpose"],
): "email.auth.signInCode" | "email.auth.registrationCode" | "email.auth.emailChangeCode" {
  if (purpose === "email_change") return "email.auth.emailChangeCode";
  if (purpose === "registration") return "email.auth.registrationCode";
  return "email.auth.signInCode";
}

export function buildAuthSignInCodeEmailProps(
  locale: EmailLocale,
  variables: AuthEmailCodeVariables,
): AuthSignInCodeEmailProps {
  const minutes = Math.ceil(variables.ttlSeconds / 60);
  const prefix = authEmailCodeMessagePrefix(variables.purpose);
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, `${prefix}.subject`, { code: variables.code }),
    preview: formatEmailMessage(locale, `${prefix}.preview`, { minutes }),
    beforeCode: formatEmailMessage(locale, `${prefix}.beforeCode`, {}),
    code: variables.code,
    line2: formatEmailMessage(locale, `${prefix}.line2`, { minutes }),
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

function buildLocationLine(
  locale: EmailLocale,
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  const locationParts = [city, country].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  const location =
    locationParts.length > 0
      ? locationParts.join(", ")
      : formatEmailMessage(locale, "email.device.approval.locationUnknown", {});
  return formatEmailMessage(locale, "email.device.approval.locationLine", { location });
}

export function buildDeviceApprovalEmailProps(
  locale: EmailLocale,
  variables: DeviceApprovalRequestVariables,
): DeviceApprovalEmailProps {
  const helpUrl = variables.helpUrl.trim();
  const deviceDetail = resolveDeviceDetailName(
    variables.deviceName,
    variables.platform,
    variables.osName,
  );
  const lead = formatEmailMessage(locale, "email.device.approval.lead", {});
  const deviceLine = formatEmailMessage(locale, "email.device.approval.deviceLine", {
    deviceName: deviceDetail,
  });
  const whenLine = variables.requestedAtIso
    ? formatEmailMessage(locale, "email.device.approval.whenLine", {
        when: formatUtcWhen(locale, variables.requestedAtIso),
      })
    : "";
  const expiresLine = variables.expiresAtIso
    ? formatEmailMessage(locale, "email.device.approval.expiresLine", {
        when: formatUtcWhen(locale, variables.expiresAtIso),
      })
    : "";
  const ipLine = formatEmailMessage(locale, "email.device.approval.ipLine", {
    ip: variables.requestIp,
  });
  const locationLine = buildLocationLine(locale, variables.city, variables.country);
  const ctaLabel = formatEmailMessage(locale, "email.device.approval.ctaOpenSettings", {});
  const noteConfirmWhere = formatEmailMessage(
    locale,
    "email.device.approval.noteConfirmWhere",
    {},
  );
  const noteNoUrl = formatEmailMessage(locale, "email.device.approval.noteNoUrl", {});
  const noteBlockIfNotYou = formatEmailMessage(
    locale,
    "email.device.approval.noteBlockIfNotYou",
    {},
  );
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.device.approval.subject", {}),
    lead,
    deviceLine,
    whenLine,
    expiresLine,
    ipLine,
    locationLine,
    helpUrl,
    ctaLabel,
    noteConfirmWhere,
    noteNoUrl,
    noteBlockIfNotYou,
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
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
  const roleLine = formatEmailMessage(locale, "email.workspaceInvite.roleLine", {
    roleName: variables.roleName,
  });
  const inviterEmailLine = formatEmailMessage(locale, "email.workspaceInvite.inviterEmailLine", {
    inviterEmail: variables.inviterEmail,
  });
  const expiresLine = formatEmailMessage(locale, "email.workspaceInvite.expiresLine", {
    when: formatUtcWhen(locale, variables.expiresAtIso),
  });
  const ctaLabel = formatEmailMessage(locale, "email.workspaceInvite.ctaAccept", {});
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.workspaceInvite.subject", {
      workspaceName: variables.workspaceName,
    }),
    intro,
    roleLine,
    inviterEmailLine,
    expiresLine,
    ctaLabel,
    inviteUrl,
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

const twoFactorEnabledKeys = {
  subject: "email.twoFactor.enabled.subject",
  line1: "email.twoFactor.enabled.line1",
  line2: "email.twoFactor.enabled.line2",
  cta: "email.twoFactor.enabled.ctaSecurity",
} as const;

const twoFactorDisabledKeys = {
  subject: "email.twoFactor.disabled.subject",
  line1: "email.twoFactor.disabled.line1",
  line2: "email.twoFactor.disabled.line2",
  cta: "email.twoFactor.disabled.ctaSecurity",
} as const;

const twoFactorBackupKeys = {
  subject: "email.twoFactor.backupRegen.subject",
  line1: "email.twoFactor.backupRegen.line1",
  line2: "email.twoFactor.backupRegen.line2",
  cta: "email.twoFactor.backupRegen.ctaSecurity",
} as const;

function buildTwoFactorNoticeEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
  keys: { subject: string; line1: string; line2: string; cta: string },
): TwoFactorNoticeEmailProps {
  const securityUrl = variables.securitySettingsUrl.trim();
  const whenUtc = formatUtcWhen(locale, variables.occurredAtIso);
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, keys.subject, {}),
    line1: formatEmailMessage(locale, keys.line1, { whenUtc }),
    line2: formatEmailMessage(locale, keys.line2, {}),
    securityUrl,
    ctaLabel: formatEmailMessage(locale, keys.cta, {}),
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

export function buildTwoFactorEnabledEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): TwoFactorNoticeEmailProps {
  return buildTwoFactorNoticeEmailProps(locale, variables, twoFactorEnabledKeys);
}

export function buildTwoFactorDisabledEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): TwoFactorNoticeEmailProps {
  return buildTwoFactorNoticeEmailProps(locale, variables, twoFactorDisabledKeys);
}

export function buildTwoFactorBackupRegeneratedEmailProps(
  locale: EmailLocale,
  variables: TwoFactorNoticeVariables,
): TwoFactorNoticeEmailProps {
  return buildTwoFactorNoticeEmailProps(locale, variables, twoFactorBackupKeys);
}

export function buildAccountEmailChangedEmailProps(
  locale: EmailLocale,
  variables: AccountEmailChangedVariables,
): TwoFactorNoticeEmailProps {
  const securityUrl = variables.securitySettingsUrl.trim();
  const whenUtc = formatUtcWhen(locale, variables.occurredAtIso);
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.account.emailChanged.subject", {}),
    line1: formatEmailMessage(locale, "email.account.emailChanged.line1", {
      newEmailMasked: variables.newEmailMasked,
      whenUtc,
    }),
    line2: formatEmailMessage(locale, "email.account.emailChanged.line2", {}),
    securityUrl,
    ctaLabel: formatEmailMessage(locale, "email.account.emailChanged.ctaSecurity", {}),
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

export function buildDeviceRecoveryApprovalEmailProps(
  locale: EmailLocale,
  variables: DeviceRecoveryApprovalRequestVariables,
): DeviceApprovalEmailProps {
  const deviceDetail = resolveDeviceDetailName(
    variables.deviceName,
    variables.platform,
    variables.osName,
  );
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.device.recovery.subject", {}),
    lead: formatEmailMessage(locale, "email.device.recovery.lead", {}),
    deviceLine: formatEmailMessage(locale, "email.device.approval.deviceLine", {
      deviceName: deviceDetail,
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
    locationLine: buildLocationLine(locale, variables.city, variables.country),
    helpUrl: variables.helpUrl.trim(),
    ctaLabel: formatEmailMessage(locale, "email.device.recovery.cta", {}),
    noteConfirmWhere: formatEmailMessage(locale, "email.device.recovery.noteConfirmWhere", {}),
    noteNoUrl: formatEmailMessage(locale, "email.device.recovery.noteNoUrl", {}),
    noteBlockIfNotYou: formatEmailMessage(locale, "email.device.recovery.noteBlockIfNotYou", {}),
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

export function buildContactRecoveryReleaseEmailProps(
  locale: EmailLocale,
  variables: ContactRecoveryReleaseRequestVariables,
): RecoveryActionEmailProps {
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.contacts.recovery.subject", {}),
    lead: formatEmailMessage(locale, "email.contacts.recovery.lead", {}),
    detailLine: formatEmailMessage(locale, "email.contacts.recovery.accountLine", {
      ownerEmail: variables.ownerEmail,
    }),
    requestLine: formatEmailMessage(locale, "email.contacts.recovery.requestLine", {
      when: formatUtcWhen(locale, variables.requestedAtIso),
    }),
    expiresLine: formatEmailMessage(locale, "email.contacts.recovery.expiresLine", {
      when: formatUtcWhen(locale, variables.expiresAtIso),
    }),
    helpUrl: variables.helpUrl.trim(),
    ctaLabel: formatEmailMessage(locale, "email.contacts.recovery.cta", {}),
    noteNoUrl: formatEmailMessage(locale, "email.contacts.recovery.noteNoUrl", {}),
    noteIgnore: formatEmailMessage(locale, "email.contacts.recovery.noteIgnore", {}),
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

export function buildTrustedContactInviteEmailProps(
  locale: EmailLocale,
  variables: TrustedContactInviteVariables,
): RecoveryActionEmailProps {
  const standard = buildEmailStandardFooterCopy(locale);
  return {
    lang: locale,
    title: formatEmailMessage(locale, "email.contacts.invite.subject", {}),
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
    noReply: standard.noReply,
    ignoreIfMistake: standard.ignoreIfMistake,
  };
}

/** Sample data for React Email dev previews (`yarn dev:email`). */
export const previewSampleAuthCode: AuthEmailCodeVariables = {
  code: "123456",
  ttlSeconds: 300,
};

export const previewSampleDeviceApproval: DeviceApprovalRequestVariables = {
  deviceName: "Web Chrome",
  platform: "Web · Chrome",
  osName: "macOS",
  requestIp: "203.0.113.9",
  country: "Singapore",
  city: "Singapore",
  helpUrl: "https://app.okkey.local/items?popup=settings|devices",
  requestedAtIso: "2026-01-15T10:00:00.000Z",
  expiresAtIso: "2026-01-15T10:10:00.000Z",
};

export const previewSampleWorkspaceInvite: WorkspaceInviteVariables = {
  inviterDisplayName: "Alex",
  inviterEmail: "alex@example.com",
  workspaceName: "Design",
  roleName: "Admin",
  expiresAtIso: "2026-01-29T10:00:00.000Z",
  inviteUrl: "https://app.okkey.local/invite/sample-token",
};

export const previewSampleTwoFactor: TwoFactorNoticeVariables = {
  occurredAtIso: "2026-01-15T10:00:00.000Z",
  securitySettingsUrl: "https://app.okkey.local/items?popup=settings|twoFactor",
};

export const previewSampleAccountEmailChanged: AccountEmailChangedVariables = {
  newEmailMasked: "n***@example.com",
  occurredAtIso: "2026-01-15T10:00:00.000Z",
  securitySettingsUrl: "https://app.okkey.local/items?popup=settings|twoFactor",
};

export const previewSampleTrustedContactInvite: TrustedContactInviteVariables = {
  inviterDisplayName: "Alex Okkey",
  inviterEmail: "alex@example.com",
  helpUrl: "https://app.okkey.local/items?popup=settings|recovery",
};
