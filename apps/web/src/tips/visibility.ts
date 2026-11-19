/**
 * Pure visibility rules for the sidebar Tips banner (TSK-256).
 * Completion is derived from real device/account/server state — completed tips are omitted.
 */

export type SidebarTipId = "setupPin" | "enableTwoFactor" | "lockOnDeviceLock" | "serverEmail";

export type DeploymentMode = "saas" | "self_hosted";

export type SidebarTipsVisibilityInput = {
  /** User closed the banner; persists via per-user local preference. */
  dismissed: boolean;
  pinEnabled: boolean;
  twoFactorEnabled: boolean;
  lockOnDeviceSleep: boolean;
  deploymentMode: DeploymentMode;
  /** Current workspace owner — required before considering the server-email tip. */
  isWorkspaceOwner: boolean;
  /**
   * SMTP active flag from GET server-mail-settings.
   * `null` = unknown / not fetched (do not show the tip; never assume for non-owners).
   */
  smtpActive: boolean | null;
};

/** Max tips shown in the slider at once. */
export const SIDEBAR_TIPS_MAX = 4;

/**
 * Returns unfinished tips in display order (at most {@link SIDEBAR_TIPS_MAX}).
 * Server-email tip is only eligible for the workspace owner on self-host while SMTP is inactive.
 */
export function visibleSidebarTips(input: SidebarTipsVisibilityInput): SidebarTipId[] {
  if (input.dismissed) {
    return [];
  }

  const tips: SidebarTipId[] = [];

  if (!input.pinEnabled) {
    tips.push("setupPin");
  }
  if (!input.twoFactorEnabled) {
    tips.push("enableTwoFactor");
  }
  if (!input.lockOnDeviceSleep) {
    tips.push("lockOnDeviceLock");
  }
  if (shouldIncludeServerEmailTip(input)) {
    tips.push("serverEmail");
  }

  return tips.slice(0, SIDEBAR_TIPS_MAX);
}

export function shouldIncludeServerEmailTip(
  input: Pick<
    SidebarTipsVisibilityInput,
    "deploymentMode" | "isWorkspaceOwner" | "smtpActive"
  >,
): boolean {
  return (
    input.deploymentMode === "self_hosted" &&
    input.isWorkspaceOwner &&
    input.smtpActive === false
  );
}

/** Whether the client may request server mail settings (avoids leaking config via API errors). */
export function mayFetchServerMailForTips(
  input: Pick<SidebarTipsVisibilityInput, "deploymentMode" | "isWorkspaceOwner">,
): boolean {
  return input.deploymentMode === "self_hosted" && input.isWorkspaceOwner;
}
